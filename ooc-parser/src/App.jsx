import { useState, useCallback, useRef } from 'react'
import { extractTextFromPDF, parseOOCText, verifyData, exportToExcel } from './parser'
import './App.css'

// ─── Top-level App ──────────────────────────────────────────────────────────
export default function App() {
  const [state, setState] = useState('idle')   // idle | loading | done | error
  const [progress, setProgress] = useState('')
  const [parsed, setParsed] = useState(null)
  const [verification, setVerification] = useState(null)
  const [error, setError] = useState(null)
  const [fileName, setFileName] = useState('')

  const handleFile = useCallback(async (file) => {
    if (!file || file.type !== 'application/pdf') {
      setError('Please upload a valid PDF file.')
      setState('error')
      return
    }
    setFileName(file.name)
    setState('loading')
    setError(null)
    try {
      setProgress('Extracting text from PDF…')
      const text = await extractTextFromPDF(file)
      setProgress('Parsing ICEGATE fields…')
      const data = parseOOCText(text)
      setProgress('Verifying totals…')
      const vfy  = verifyData(data)
      setParsed(data)
      setVerification(vfy)
      setState('done')
    } catch (e) {
      console.error(e)
      setError(e.message || 'Failed to parse PDF. Make sure it is an ICEGATE OOC document.')
      setState('error')
    }
  }, [])

  const reset = () => {
    setState('idle'); setParsed(null); setVerification(null); setError(null); setFileName('')
  }

  return (
    <div className="app">
      <Header />
      <main className="main">
        {state === 'idle'    && <UploadZone onFile={handleFile} />}
        {state === 'loading' && <Loader message={progress} />}
        {state === 'error'   && <ErrorView message={error} onReset={reset} />}
        {state === 'done'    && parsed && (
          <Dashboard
            parsed={parsed}
            verification={verification}
            fileName={fileName}
            onReset={reset}
          />
        )}
      </main>
      <footer className="footer">
        <span>ICEGATE OOC Parser</span>
        <span className="sep">·</span>
        <span>Supports all ICEGATE-generated OOC Bill of Entry PDFs</span>
        <span className="sep">·</span>
        <span>Processing is 100% client-side — no data leaves your browser</span>
      </footer>
    </div>
  )
}

// ─── Header ─────────────────────────────────────────────────────────────────
function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="logo">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="#00d4aa" fillOpacity="0.15"/>
            <path d="M6 8h16M6 14h10M6 20h13" stroke="#00d4aa" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="21" cy="20" r="4" fill="#00d4aa"/>
            <path d="M19.5 20l1 1 2-2" stroke="#0a0c10" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <div className="logo-title">OOC Parser</div>
            <div className="logo-sub">ICEGATE Bill of Entry</div>
          </div>
        </div>
        <div className="header-badge">
          <span className="dot green" />
          Client-side · Secure
        </div>
      </div>
    </header>
  )
}

// ─── Upload Zone ─────────────────────────────────────────────────────────────
function UploadZone({ onFile }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const onDrop = e => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }
  const onDragOver = e => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)

  return (
    <div className="upload-wrap">
      <div className="upload-hero">
        <h1>Parse any ICEGATE OOC document</h1>
        <p>Upload a PDF and instantly extract all Bill of Entry fields — header, manifest, invoices, duty summary, and all line items — then export to Excel.</p>
      </div>
      <div
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current.click()}
      >
        <input ref={inputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => onFile(e.target.files[0])} />
        <div className="drop-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#00d4aa" fillOpacity="0.08"/>
            <path d="M24 14v16M17 22l7-8 7 8" stroke="#00d4aa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 34h20" stroke="#00d4aa" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="drop-text">
          <strong>Drop your OOC PDF here</strong>
          <span>or click to browse</span>
        </div>
        <div className="drop-hint">Supports all ICEGATE OOC Bill of Entry PDFs</div>
      </div>
      <div className="feature-grid">
        {[
          { icon: '⬡', title: 'All Fields Extracted', desc: 'Header, Status, Duty Summary, Manifest, Container, Invoices, and all Line Items' },
          { icon: '◈', title: 'Auto Verification', desc: 'Validates item count and cross-checks Assess Value & Total Duty against header totals' },
          { icon: '⬟', title: 'Excel Export', desc: 'Download a multi-sheet Excel workbook with Summary, Invoices, and Item Details' },
          { icon: '◉', title: '100% Private', desc: 'All processing happens in your browser — no PDF data is ever uploaded to any server' },
        ].map(f => (
          <div key={f.title} className="feature-card">
            <div className="feature-icon">{f.icon}</div>
            <div className="feature-title">{f.title}</div>
            <div className="feature-desc">{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Loader ──────────────────────────────────────────────────────────────────
function Loader({ message }) {
  return (
    <div className="loader-wrap">
      <div className="spinner" />
      <div className="loader-msg">{message}</div>
      <div className="loader-sub">This may take a few seconds for large PDFs</div>
    </div>
  )
}

// ─── Error View ──────────────────────────────────────────────────────────────
function ErrorView({ message, onReset }) {
  return (
    <div className="error-wrap">
      <div className="error-icon">!</div>
      <h2>Parsing Failed</h2>
      <p>{message}</p>
      <button className="btn-primary" onClick={onReset}>Try Again</button>
    </div>
  )
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
function Dashboard({ parsed, verification, fileName, onReset }) {
  const [tab, setTab] = useState('summary')
  const tabs = [
    { key: 'summary',   label: 'Summary' },
    { key: 'invoices',  label: `Invoices (${parsed.invoices.length})` },
    { key: 'items',     label: `Items (${parsed.items.length})` },
  ]

  const handleExport = async () => {
    await exportToExcel(parsed, verification)
  }

  return (
    <div className="dashboard">
      <div className="dash-header">
        <div>
          <div className="dash-title">
            BE {parsed.header.beNo || '—'}
            <span className="dash-date">{parsed.header.beDate}</span>
          </div>
          <div className="dash-file">{fileName} · {parsed.header.portName || parsed.header.portCode}</div>
        </div>
        <div className="dash-actions">
          <button className="btn-outline" onClick={onReset}>← Upload New</button>
          <button className="btn-primary" onClick={handleExport}>↓ Export Excel</button>
        </div>
      </div>

      <VerificationBar verification={verification} />

      <div className="tabs">
        {tabs.map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {tab === 'summary'  && <SummaryTab  parsed={parsed} verification={verification} />}
        {tab === 'invoices' && <InvoicesTab parsed={parsed} />}
        {tab === 'items'    && <ItemsTab    parsed={parsed} />}
      </div>
    </div>
  )
}

// ─── Verification Bar ────────────────────────────────────────────────────────
function VerificationBar({ verification: v }) {
  const checks = [
    { label: 'Items', ok: v.itemsMatch,       detail: `${v.itemsFound} / ${v.itemsExpected ?? '?'}` },
    { label: 'Assess Value', ok: v.assessValMatch, detail: v.assessValMatch == null ? 'N/A' : v.assessValMatch ? '✓ Match' : '✗ Mismatch' },
    { label: 'Total Duty',   ok: v.dutyMatch,      detail: v.dutyMatch == null ? 'N/A' : v.dutyMatch ? '✓ Match' : '✗ Mismatch' },
  ]
  return (
    <div className="verify-bar">
      <span className="verify-label">Verification</span>
      {checks.map(c => (
        <div key={c.label} className={`verify-item ${c.ok === null ? 'na' : c.ok ? 'ok' : 'fail'}`}>
          <span className="vdot" />
          <span className="vl">{c.label}:</span>
          <span className="vv">{c.detail}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Summary Tab ─────────────────────────────────────────────────────────────
function SummaryTab({ parsed, verification: v }) {
  const { header: h, status: s, dutySummary: d, manifest: mf, container, oocInfo, exchangeRates } = parsed
  const inr = n => n != null ? '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'

  return (
    <div className="summary-tab">
      <div className="kpi-row">
        <KPI label="Invoices"       value={h.invCount ?? parsed.invoices.length} />
        <KPI label="Items"          value={h.itemCount ?? parsed.items.length} />
        <KPI label="Assess Value"   value={inr(d.totAssVal)} mono />
        <KPI label="Total Duty"     value={inr(d.totAmount)} mono />
        <KPI label="Packages"       value={h.pkg ? Number(h.pkg).toLocaleString() : '—'} />
        <KPI label="GW (KGS)"       value={h.gw ? Number(h.gw).toLocaleString() : '—'} />
      </div>

      <div className="info-grid">
        <InfoBox title="Part I — Header">
          <Row label="Port Code"    value={h.portCode} />
          <Row label="Port"         value={h.portName} />
          <Row label="BE Number"    value={h.beNo} mono />
          <Row label="BE Date"      value={h.beDate} />
          <Row label="BE Type"      value={h.beTypeFull} />
          <Row label="IEC / Branch" value={h.iec} mono />
          <Row label="GSTIN"        value={h.gstin} mono />
          <Row label="CB Code"      value={h.cbCode} mono />
        </InfoBox>

        <InfoBox title="A. Status">
          <Row label="13. Country of Origin"      value={s.countryOrigin} />
          <Row label="14. Country of Consignment" value={s.countryConsignment} />
          <Row label="15. Port of Loading"        value={s.portLoading} />
          <Row label="16. Port of Shipment"       value={s.portShipment} />
        </InfoBox>

        <InfoBox title="C. Duty Summary">
          <Row label="BCD"                   value={inr(d.bcd)} mono />
          <Row label="SWS"                   value={inr(d.sws)} mono />
          <Row label="IGST"                  value={inr(d.igst)} mono />
          <Row label="14. Total Duty"        value={inr(d.totalDuty)} mono />
          <Row label="17. Fine"              value={inr(d.fine)} mono />
          <Row label="18. Tot. Assess Val"   value={inr(d.totAssVal)} mono />
          <Row label="19. Tot. Amount"       value={inr(d.totAmount)} mono />
        </InfoBox>

        <InfoBox title="D. Manifest Details">
          <Row label="1. IGM No"    value={mf.igmNo} mono />
          <Row label="2. IGM Date"  value={mf.igmDate} />
          <Row label="3. INW Date"  value={mf.inwDate} />
          <Row label="6. MAWB No"   value={mf.mawbNo} mono />
          <Row label="7. Date"      value={mf.mawbDate} />
          <Row label="10. PKG"      value={mf.pkg} />
          <Row label="11. GW"       value={mf.gw} />
        </InfoBox>

        <InfoBox title="J. Container Details">
          {container.length ? container.map((c, idx) => (
            <div key={idx}>
              <Row label="4. Seal"            value={c.seal} mono />
              <Row label="5. Container No"    value={c.containerNo} mono />
              <Row label="Type"               value={c.type} />
              {idx < container.length - 1 && <hr className="row-sep" />}
            </div>
          )) : <div className="empty-row">No container data found</div>}
        </InfoBox>

        <InfoBox title="OOC & Exchange Rates">
          <Row label="OOC No"   value={oocInfo.oocNo} mono />
          <Row label="OOC Date" value={oocInfo.oocDate} />
          <hr className="row-sep" />
          {Object.entries(exchangeRates).map(([cur, rate]) => (
            <Row key={cur} label={`1 ${cur}`} value={`₹ ${rate}`} mono />
          ))}
        </InfoBox>
      </div>

      <InfoBox title="Verification Details">
        <Row label="Items Parsed"         value={v.itemsFound} />
        <Row label="Items Expected"       value={v.itemsExpected ?? '—'} />
        <Row label="Sum Assess Value"     value={inr(v.sumAssessVal)} mono />
        <Row label="Header Assess Value"  value={inr(v.headerAssessVal)} mono />
        <Row label="Assess Val Match"     value={v.assessValMatch === null ? 'N/A' : v.assessValMatch ? '✓ Yes' : '✗ No'} className={v.assessValMatch ? 'ok' : 'fail'} />
        <Row label="Sum Total Duty"       value={inr(v.sumTotalDuty)} mono />
        <Row label="Header Total Duty"    value={inr(v.headerTotalDuty)} mono />
        <Row label="Duty Match"           value={v.dutyMatch === null ? 'N/A' : v.dutyMatch ? '✓ Yes' : '✗ No'} className={v.dutyMatch ? 'ok' : 'fail'} />
      </InfoBox>
    </div>
  )
}

// ─── Invoices Tab ────────────────────────────────────────────────────────────
function InvoicesTab({ parsed }) {
  const { invoices, items } = parsed
  const inr = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })

  const invTotals = {}
  items.forEach(it => {
    if (!invTotals[it.invsno]) invTotals[it.invsno] = { av: 0, td: 0, cnt: 0 }
    invTotals[it.invsno].av  += it.assessValue
    invTotals[it.invsno].td  += it.totalDuty
    invTotals[it.invsno].cnt += 1
  })

  const totalAV = items.reduce((s, i) => s + i.assessValue, 0)
  const totalTD = items.reduce((s, i) => s + i.totalDuty, 0)

  return (
    <div className="table-section">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>S.No</th>
              <th>Invoice No</th>
              <th className="num">Invoice Amt</th>
              <th>Currency</th>
              <th className="num">Items</th>
              <th className="num">Assess Val (₹)</th>
              <th className="num">Total Duty (₹)</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => {
              const t = invTotals[inv.sno] || { av: 0, td: 0, cnt: 0 }
              return (
                <tr key={inv.sno}>
                  <td><Pill n={inv.sno}>{inv.sno}</Pill></td>
                  <td className="mono">{inv.invoiceNo}</td>
                  <td className="num">{inv.invAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td><span className="cur-badge">{inv.currency}</span></td>
                  <td className="num">{t.cnt}</td>
                  <td className="num">{inr(Math.round(t.av * 100) / 100)}</td>
                  <td className="num">{inr(Math.round(t.td * 100) / 100)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}><strong>Total</strong></td>
              <td className="num"><strong>{items.length}</strong></td>
              <td className="num"><strong>{inr(Math.round(totalAV * 100) / 100)}</strong></td>
              <td className="num"><strong>{inr(Math.round(totalTD * 100) / 100)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─── Items Tab ───────────────────────────────────────────────────────────────
function ItemsTab({ parsed }) {
  const { items } = parsed
  const [search, setSearch] = useState('')
  const [filterInv, setFilterInv] = useState('')
  const [sortKey, setSortKey] = useState('invsno')
  const [sortDir, setSortDir] = useState(1)
  const [page, setPage] = useState(1)
  const PAGE = 50

  const inr = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })
  const invNos = [...new Set(items.map(i => i.invsno))].sort((a, b) => a - b)

  const filtered = items
    .filter(it => {
      const q = search.toLowerCase()
      const matchQ = !q || it.itemDescription.toLowerCase().includes(q) || it.cth.includes(q) || String(it.invsno).includes(q)
      const matchI = !filterInv || String(it.invsno) === filterInv
      return matchQ && matchI
    })
    .sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : -1) * sortDir)

  const totalPages = Math.ceil(filtered.length / PAGE)
  const pageItems  = filtered.slice((page - 1) * PAGE, page * PAGE)
  const sumAV = filtered.reduce((s, i) => s + i.assessValue, 0)
  const sumTD = filtered.reduce((s, i) => s + i.totalDuty, 0)

  const sort = key => {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(1) }
    setPage(1)
  }

  const SortTh = ({ k, children, className = '' }) => (
    <th className={`sortable ${sortKey === k ? 'sorted' : ''} ${className}`} onClick={() => sort(k)}>
      {children} <span className="sort-arrow">{sortKey === k ? (sortDir === 1 ? '↑' : '↓') : '↕'}</span>
    </th>
  )

  return (
    <div className="table-section">
      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search description, CTH, invoice…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
        <select className="filter-select" value={filterInv} onChange={e => { setFilterInv(e.target.value); setPage(1) }}>
          <option value="">All Invoices</option>
          {invNos.map(n => <option key={n} value={n}>Invoice {n}</option>)}
        </select>
        <span className="count">{filtered.length} items</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <SortTh k="invsno">Inv</SortTh>
              <SortTh k="itemsn">Item</SortTh>
              <th>CTH</th>
              <th>Item Description</th>
              <SortTh k="assessValue" className="num">Assess Val (₹)</SortTh>
              <SortTh k="totalDuty"  className="num">Total Duty (₹)</SortTh>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((it, idx) => (
              <tr key={idx}>
                <td><Pill n={it.invsno}>{it.invsno}</Pill></td>
                <td className="center">{it.itemsn}</td>
                <td className="mono">{it.cth}</td>
                <td className="desc">{it.itemDescription}</td>
                <td className="num">{inr(it.assessValue)}</td>
                <td className="num">{inr(it.totalDuty)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}><strong>Subtotal ({filtered.length} items)</strong></td>
              <td className="num"><strong>{inr(Math.round(sumAV * 100) / 100)}</strong></td>
              <td className="num"><strong>{inr(Math.round(sumTD * 100) / 100)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const n = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i
            return (
              <button key={n} className={n === page ? 'active' : ''} onClick={() => setPage(n)}>{n}</button>
            )
          })}
          <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
          <span className="page-info">Page {page} of {totalPages}</span>
        </div>
      )}
    </div>
  )
}

// ─── Shared UI Components ────────────────────────────────────────────────────
const PILL_COLORS = [
  '#00d4aa', '#0099ff', '#ff6b35', '#a855f7',
  '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'
]

function Pill({ n, children }) {
  const color = PILL_COLORS[(n - 1) % PILL_COLORS.length]
  return (
    <span className="pill" style={{ '--pill-color': color }}>
      {children}
    </span>
  )
}

function KPI({ label, value, mono }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${mono ? 'mono' : ''}`}>{value ?? '—'}</div>
    </div>
  )
}

function InfoBox({ title, children }) {
  return (
    <div className="info-box">
      <div className="info-box-title">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value, mono, className }) {
  return (
    <div className="info-row">
      <span className="info-key">{label}</span>
      <span className={`info-val ${mono ? 'mono' : ''} ${className || ''}`}>{value || '—'}</span>
    </div>
  )
}
