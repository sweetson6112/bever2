# OOC Parser — ICEGATE Bill of Entry

A client-side React app that parses any ICEGATE-generated Out of Charge (OOC) PDF and extracts all structured data.

## What It Extracts

| Section | Fields |
|---------|--------|
| Part I Header | BE No, BE Date, Port, IEC, GSTIN, CB Code, Invoice count, Item count, PKG, GW |
| A. Status | Country of Origin, Country of Consignment, Port of Loading, Port of Shipment |
| C. Duty Summary | BCD, SWS, IGST, Total Duty, Fine, Tot. Assess Value, Tot. Amount |
| D. Manifest | IGM No, IGM Date, INW Date, MAWB No, MAWB Date, PKG, GW |
| J. Container | Seal No, Container Number, Type |
| I. Invoice Summary | S.No, Invoice No, Amount, Currency |
| Part III Items | InvSNo, ItemSNo, CTH, Description, Assess Value, Total Duty |
| OOC Info | OOC No, OOC Date |
| Exchange Rates | All currency conversion rates from the document |

## Verification

The app automatically verifies:
- Item count matches header
- Sum of item Assess Values = header Total Assess Value
- Sum of item Total Duties = header Total Amount

## Running Locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

### Option A: CLI (fastest)
```bash
npm install -g vercel
vercel
```

### Option B: GitHub + Vercel Dashboard
1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → Add New Project
3. Import your repo
4. Vercel auto-detects Vite — click **Deploy**

No environment variables needed. All processing is client-side.

## Build for Production

```bash
npm run build
# Output is in /dist — can be hosted on any static host
```

## Privacy

All PDF parsing happens entirely in the browser using `pdfjs-dist`. No data is sent to any server.
