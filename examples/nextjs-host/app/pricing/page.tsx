import { SiteNav } from '../components/site-nav'

export default function PricingPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem', lineHeight: 1.6 }}>
      <SiteNav />
      <h1>Pricing</h1>
      <table>
        <thead>
          <tr>
            <th>Plan</th>
            <th>Price</th>
            <th>Seats</th>
          </tr>
        </thead>
        <tbody>
          <tr id="plan-starter">
            <td>Starter</td>
            <td>$0</td>
            <td>3</td>
          </tr>
          <tr id="plan-team">
            <td>Team</td>
            <td>$29</td>
            <td>10</td>
          </tr>
          <tr id="plan-scale">
            <td>Scale</td>
            <td>$99</td>
            <td>Unlimited</td>
          </tr>
        </tbody>
      </table>
      <p>Reorder or rename these rows in the source to test re-anchoring under DOM mutation.</p>
    </main>
  )
}
