import { expect, test } from '@playwright/experimental-ct-react'
import AccountsPage from '../src/app/(app)/accounts/page'

for (const mobile of [false,true]) {
  test(`PIN reopens only the chosen Accounts entry ${mobile?'mobile':'desktop'}`,async({mount,page})=>{
    await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1000})
    await page.evaluate(()=>{
      const now=new Date(),month=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
      const bb={id:'a',name:'Sandakan',location:'Synthetic',profit_share_percent:20}
      const booking={id:'b',brand_name:'Enchanteur',billboard_id:'a',billboard:bb,client:{company_name:'Punya Creative'},start_date:`${month}-01`,end_date:`${month}-28`,monthly_rate:4600,total_amount:4600,status:'completed'}
      Object.assign(window,{accountsCanEdit:true,salesFixture:{billboards:[bb],bookings:[booking,{...booking,id:'other',brand_name:'Other entry'}],monthly_payments:[{id:'p',booking_id:'b',month,amount:4600,status:'completed',invoice_number:'@test'},{id:'q',booking_id:'other',month,amount:4600,status:'completed',invoice_number:'@other'}],profit_sharing:[{booking_id:'b',month,status:'waiting_profit_share'}]}})
    })
    await mount(<AccountsPage />)
    await page.getByLabel('Filter by invoice number').fill('@test')
    await page.getByRole('button',{name:'✅ Completed',exact:true}).first().click()
    await expect(page.getByRole('dialog')).toContainText('Enchanteur')
    await expect(page.getByRole('dialog')).toContainText('@test')
    const submit=page.getByRole('button',{name:'Return to Invoice Sent'})
    await expect(submit).toBeDisabled()
    await page.getByLabel('PIN',{exact:true}).fill('9999');await submit.click()
    await expect(page.getByRole('alert')).toHaveText('Incorrect PIN.')
    await expect(page.getByLabel('PIN',{exact:true})).toHaveValue('')
    await page.screenshot({path:`/Users/canggih/.openclaw/backups/pcsb-app/accounts-unlock-20261114/dialog-${mobile?'mobile':'desktop'}.png`,fullPage:true})
    await page.getByLabel('PIN',{exact:true}).fill('2468');await submit.click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button',{name:'📨 Invoice Sent',exact:true}).first()).toBeVisible()
    const state=await page.evaluate(()=>{const s=window as unknown as {salesFixture:Record<string,Array<Record<string,unknown>>>;accountsUnlockRequests:number};return {payments:s.salesFixture.monthly_payments,profits:s.salesFixture.profit_sharing,requests:s.accountsUnlockRequests}})
    expect(state.payments.find(p=>p.id==='p')?.status).toBe('invoice_sent')
    expect(state.payments.find(p=>p.id==='q')?.status).toBe('completed')
    expect(state.profits[0].status).toBe('waiting_profit_share')
    expect(state.requests).toBe(2)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  })
}
