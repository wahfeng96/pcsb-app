-- Accounts reopening is separate from Profit Sharing and Commission settlement.
-- Private verifier, durable attempts and transaction capabilities are never exposed by PostgREST.
CREATE SCHEMA IF NOT EXISTS accounts_private;
REVOKE ALL ON SCHEMA accounts_private FROM PUBLIC, anon, authenticated;
CREATE TABLE accounts_private.unlock_config (singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), pin_hash text NOT NULL);
INSERT INTO accounts_private.unlock_config VALUES (true, '$2a$10$.yR47IZMILtFf4VHR9OjpO6TSSBbvSNUnKJ3.CylpIUeQUBNw9c0q');
CREATE TABLE accounts_private.unlock_attempts (user_id uuid PRIMARY KEY, attempts integer NOT NULL DEFAULT 0, window_started timestamptz NOT NULL DEFAULT now());
CREATE TABLE accounts_private.unlock_capabilities (transaction_id bigint NOT NULL, booking_id uuid NOT NULL, month text NOT NULL, PRIMARY KEY(transaction_id, booking_id, month));
CREATE TABLE accounts_private.unlock_audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, payment_id uuid NOT NULL, actor_id uuid, previous_status text NOT NULL, reopened_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON ALL TABLES IN SCHEMA accounts_private FROM PUBLIC, anon, authenticated;
ALTER TABLE public.monthly_payments ADD COLUMN accounts_reopened_at timestamptz;

CREATE FUNCTION public.guard_accounts_completed_payment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE protected boolean; permitted boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    protected := NEW.status <> 'completed' AND (EXISTS (SELECT 1 FROM public.profit_sharing p WHERE p.booking_id=NEW.booking_id AND p.month=NEW.month AND p.status IN ('waiting_profit_share','settled')) OR EXISTS (SELECT 1 FROM public.monthly_payments p WHERE p.booking_id=NEW.booking_id AND p.month=NEW.month AND p.status='completed'));
  ELSE
    protected := OLD.status='completed' OR (OLD.accounts_reopened_at IS NULL AND EXISTS (SELECT 1 FROM public.profit_sharing p WHERE p.booking_id=OLD.booking_id AND p.month=OLD.month AND p.status IN ('waiting_profit_share','settled')));
  END IF;
  SELECT EXISTS (SELECT 1 FROM accounts_private.unlock_capabilities c WHERE c.transaction_id=txid_current() AND c.booking_id=CASE WHEN TG_OP='DELETE' THEN OLD.booking_id ELSE NEW.booking_id END AND c.month=CASE WHEN TG_OP='DELETE' THEN OLD.month ELSE NEW.month END) INTO permitted;
  IF TG_OP='DELETE' THEN
    IF protected AND NOT permitted THEN RAISE EXCEPTION 'Unlock this completed Accounts entry with its PIN before deleting it.' USING ERRCODE='42501'; END IF;
    RETURN OLD;
  END IF;
  IF NOT permitted AND (
    (TG_OP='INSERT' AND (protected OR NEW.accounts_reopened_at IS NOT NULL)) OR
    (TG_OP='UPDATE' AND ((protected AND (NEW.status IS DISTINCT FROM OLD.status AND NEW.status<>'completed' OR NEW.booking_id IS DISTINCT FROM OLD.booking_id OR NEW.month IS DISTINCT FROM OLD.month)) OR NEW.accounts_reopened_at IS DISTINCT FROM OLD.accounts_reopened_at))
  ) THEN RAISE EXCEPTION 'Use the Accounts PIN unlock to reopen a completed entry.' USING ERRCODE='42501'; END IF;
  IF NEW.status='completed' THEN NEW.accounts_reopened_at := NULL; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_accounts_completed_payment() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER monthly_payments_accounts_completed_guard BEFORE INSERT OR UPDATE OR DELETE ON public.monthly_payments FOR EACH ROW EXECUTE FUNCTION public.guard_accounts_completed_payment();

CREATE FUNCTION public.unlock_accounts_payment(p_booking_id uuid, p_month text, p_payment_id uuid, p_pin text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE actor uuid:=auth.uid(); attempt record; payment public.monthly_payments%ROWTYPE; booking public.bookings%ROWTYPE; n integer; previous text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=actor AND p.role='owner') THEN RAISE EXCEPTION 'Only the owner can unlock Accounts entries' USING ERRCODE='42501'; END IF;
  INSERT INTO accounts_private.unlock_attempts(user_id) VALUES(actor) ON CONFLICT DO NOTHING;
  SELECT * INTO attempt FROM accounts_private.unlock_attempts WHERE user_id=actor FOR UPDATE;
  IF attempt.window_started <= now()-interval '15 minutes' THEN
    UPDATE accounts_private.unlock_attempts SET attempts=0,window_started=now() WHERE user_id=actor;
    attempt.attempts:=0;
  END IF;
  IF attempt.attempts>=5 THEN RETURN jsonb_build_object('ok',false,'error','Too many attempts. Try again after 15 minutes.'); END IF;
  IF p_pin IS NULL OR length(p_pin)<>4 OR NOT EXISTS (SELECT 1 FROM accounts_private.unlock_config WHERE pin_hash=extensions.crypt(p_pin,pin_hash)) THEN
    UPDATE accounts_private.unlock_attempts SET attempts=attempts+1 WHERE user_id=actor;
    RETURN jsonb_build_object('ok',false,'error','Incorrect PIN.');
  END IF;
  IF p_month IS NULL OR p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Invalid billing month' USING ERRCODE='22023'; END IF;
  SELECT * INTO booking FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
  IF NOT FOUND OR booking.status='cancelled' THEN RETURN jsonb_build_object('ok',false,'error','Booking unavailable. Refresh Accounts.'); END IF;
  SELECT count(*) INTO n FROM public.monthly_payments WHERE booking_id=p_booking_id AND month=p_month;
  IF n>1 THEN RETURN jsonb_build_object('ok',false,'error','Duplicate payment entries require review.'); END IF;
  SELECT * INTO payment FROM public.monthly_payments WHERE booking_id=p_booking_id AND month=p_month FOR UPDATE;
  IF payment.id IS DISTINCT FROM p_payment_id THEN RETURN jsonb_build_object('ok',false,'error','Entry changed. Refresh Accounts and try again.'); END IF;
  IF NOT (COALESCE(payment.status='completed',false) OR (payment.accounts_reopened_at IS NULL AND EXISTS (SELECT 1 FROM public.profit_sharing p WHERE p.booking_id=p_booking_id AND p.month=p_month AND p.status IN ('waiting_profit_share','settled')))) THEN
    RETURN jsonb_build_object('ok',false,'error','Only completed entries can be unlocked. Refresh Accounts.');
  END IF;
  previous:=COALESCE(payment.status,'profit_sharing_completed');
  INSERT INTO accounts_private.unlock_capabilities VALUES(txid_current(),p_booking_id,p_month);
  IF payment.id IS NULL THEN
    INSERT INTO public.monthly_payments(booking_id,month,amount,status,accounts_reopened_at) VALUES(p_booking_id,p_month,booking.monthly_rate,'invoice_sent',now()) RETURNING * INTO payment;
  ELSE
    UPDATE public.monthly_payments SET status='invoice_sent',settled_at=NULL,accounts_reopened_at=now() WHERE id=payment.id RETURNING * INTO payment;
  END IF;
  DELETE FROM accounts_private.unlock_capabilities WHERE transaction_id=txid_current() AND booking_id=p_booking_id AND month=p_month;
  INSERT INTO accounts_private.unlock_audit(payment_id,actor_id,previous_status) VALUES(payment.id,actor,previous);
  UPDATE accounts_private.unlock_attempts SET attempts=0,window_started=now() WHERE user_id=actor;
  RETURN jsonb_build_object('ok',true,'payment_id',payment.id,'status',payment.status);
END $$;
REVOKE ALL ON FUNCTION public.unlock_accounts_payment(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_accounts_payment(uuid,text,uuid,text) TO authenticated;

-- Preserve the owner's already-applied single-entry correction in the effective Accounts UI.
-- No statuses, amounts, Profit Sharing, commissions or P&L assignments are changed here.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.monthly_payments WHERE id='d4e49ff9-7f51-4647-8aed-7b84e8742d04' AND booking_id='35a66883-295d-442c-8435-e9cc518fae02' AND month='2026-08' AND invoice_number='@1424' AND amount=4600 AND status='invoice_sent' AND settled_at IS NULL) THEN
    INSERT INTO accounts_private.unlock_capabilities VALUES(txid_current(),'35a66883-295d-442c-8435-e9cc518fae02','2026-08');
    UPDATE public.monthly_payments SET accounts_reopened_at=now() WHERE id='d4e49ff9-7f51-4647-8aed-7b84e8742d04';
    DELETE FROM accounts_private.unlock_capabilities WHERE transaction_id=txid_current();
    INSERT INTO accounts_private.unlock_audit(payment_id,previous_status) VALUES('d4e49ff9-7f51-4647-8aed-7b84e8742d04','owner_correction');
  END IF;
END $$;
