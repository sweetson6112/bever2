/**
 * ICEGATE OOC PDF Parser
 * Parses any ICEGATE-generated Out of Charge (OOC) Bill of Entry PDF.
 * Uses pdfjs-dist to extract text, then applies regex + positional logic
 * to extract all required fields.
 */

import * as pdfjsLib from 'pdfjs-dist'

// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

/** Extract full text from PDF, page by page, preserving layout */
export async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    // Sort items top→bottom, left→right to approximate line order
    const items = content.items
      .filter(i => i.str.trim())
      .sort((a, b) => {
        const yDiff = Math.round(b.transform[5]) - Math.round(a.transform[5])
        if (Math.abs(yDiff) > 4) return yDiff
        return a.transform[4] - b.transform[4]
      })
    // Group into pseudo-lines by Y coordinate
    const lines = []
    let currentY = null
    let currentLine = []
    for (const item of items) {
      const y = Math.round(item.transform[5])
      if (currentY === null || Math.abs(y - currentY) > 4) {
        if (currentLine.length) lines.push(currentLine.map(i => i.str).join(' '))
        currentLine = [item]
        currentY = y
      } else {
        currentLine.push(item)
      }
    }
    if (currentLine.length) lines.push(currentLine.map(i => i.str).join(' '))
    pages.push(lines.join('\n'))
  }

  return pages.join('\n')
}

/** Main parser — returns structured data object */
export function parseOOCText(text) {
  const lines = text.split('\n')

  return {
    header:       parseHeader(text, lines),
    status:       parseStatus(text, lines),
    dutySummary:  parseDutySummary(text, lines),
    manifest:     parseManifest(text, lines),
    container:    parseContainer(text, lines),
    oocInfo:      parseOOCInfo(text, lines),
    exchangeRates:parseExchangeRates(text, lines),
    invoices:     parseInvoices(text, lines),
    items:        parseItems(text, lines),
  }
}

// ─── HEADER ────────────────────────────────────────────────────────────────

function parseHeader(text, lines) {
  const portCode   = firstMatch(text, /Port\s*Code[\s\S]{0,60}?(IN[A-Z]{3}\d?)/i)
                  || firstMatch(text, /\b(IN[A-Z]{3,4}\d?)\b/)
  const beNo       = firstMatch(text, /BE\s*No\s+(\d+)/i)
                  || firstMatch(text, /\b(\d{7})\b/)
  const beDate     = firstMatch(text, /BE\s*Date\s+([\d/]+)/i)
                  || firstMatch(text, /\b(\d{2}\/\d{2}\/\d{4})\b/)
  const beType     = firstMatch(text, /BE\s*Type\s+(\w)/i)
  const iec        = firstMatch(text, /IEC\/Br[\s\S]{0,40}?(\d{10}\/\d+)/i)
  const gstin      = firstMatch(text, /GSTIN[\s\S]{0,60}?([A-Z\d]{15})/i)
  const cbCode     = firstMatch(text, /CB\s*CODE[\s\S]{0,60}?([A-Z\d]{15,20})/i)

  const invMatch   = text.match(/(?:INV|Inv)\s+(?:ITEM|Item)[\s\S]{0,40}?Nos\s+(\d+)\s+(\d+)/i)
                  || text.match(/Nos\s+(\d+)\s+(\d+)\s+\d/)
  const invCount   = invMatch ? parseInt(invMatch[1]) : null
  const itemCount  = invMatch ? parseInt(invMatch[2]) : null

  const pkgMatch   = text.match(/PKG\s+(\d[\d,]*)\s+G\.?WT\s*\(KGS\)\s+([\d.]+)/i)
  const pkg        = pkgMatch ? pkgMatch[1].replace(/,/g, '') : null
  const gw         = pkgMatch ? pkgMatch[2] : null

  const portLine   = lines.find(l => /PORT\s*:/i.test(l))
  const portName   = portLine ? portLine.replace(/PORT\s*:/i, '').trim().split(/\s{2,}/)[0].trim() : null

  const beTypeFull = firstMatch(text, /BILL OF ENTRY FOR\s+([A-Z\s]+BE)/i) || 'HOME CONSUMPTION BE'

  return { portCode, portName, beNo, beDate, beType, iec, gstin, cbCode, invCount, itemCount, pkg, gw, beTypeFull }
}

// ─── STATUS ────────────────────────────────────────────────────────────────

function parseStatus(text) {
  const countryOrigin      = firstMatch(text, /13\.COUNTRY\s+OF\s+ORIGIN\s+([A-Z][A-Z\s]+?)(?:\s{2,}|14\.)/i)
  const countryConsignment = firstMatch(text, /14\.COUNTRY\s+OF\s+CONSIGNMENT\s+([A-Z][A-Z\s]+?)(?:\s{2,}|$)/im)
  const portLoading        = firstMatch(text, /15\.PORT\s+OF\s+LOADING\s+(\S+(?:\s+\S+)?)/i)
  const portShipment       = firstMatch(text, /16\.PORT\s+OF\s+SHIPMENT\s+(\S+(?:\s+\S+)?)/i)
  return {
    countryOrigin:      countryOrigin?.trim(),
    countryConsignment: countryConsignment?.trim(),
    portLoading:        portLoading?.trim(),
    portShipment:       portShipment?.trim(),
  }
}

// ─── DUTY SUMMARY ──────────────────────────────────────────────────────────

function parseDutySummary(text, lines) {
  // Find the line with BCD/ACD/SWS headers, then get the values line
  let bcd, acd, sws, igst, totAssVal
  const headerIdx = lines.findIndex(l => /1\.BCD\s+2\.ACD/i.test(l))
  if (headerIdx !== -1) {
    // Values are within next 10 lines
    for (let i = headerIdx + 1; i < Math.min(headerIdx + 10, lines.length); i++) {
      const m = lines[i].match(/([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s/)
      if (m) {
        bcd = num(m[1]); acd = num(m[2]); sws = num(m[3])
        const nums = lines[i].match(/[\d,]+\.?\d+/g) || []
        if (nums.length >= 7) igst = num(nums[6])
        if (nums.length >= 9) totAssVal = num(nums[8])
        break
      }
    }
  }

  let totalDuty, fine, totAmount
  const header2Idx = lines.findIndex(l => /14\.TOTAL\s+DUTY/i.test(l))
  if (header2Idx !== -1) {
    for (let i = header2Idx + 1; i < Math.min(header2Idx + 10, lines.length); i++) {
      const nums = (lines[i].match(/[\d,]+\.?\d*/g) || []).filter(n => n.length > 4)
      if (nums.length >= 1) {
        totalDuty = num(nums[0])
        if (nums.length >= 2) totAmount = num(nums[nums.length - 1])
        break
      }
    }
  }

  // Fine: tot amount - totalDuty (if different)
  if (totAmount && totalDuty && Math.abs(totAmount - totalDuty) > 1) {
    fine = totAmount - totalDuty
  } else {
    fine = 0
  }

  // Fallback: search directly
  if (!totAssVal) {
    const m = text.match(/18\.TOT\.?ASS\.?\s*VAL[\s\S]{0,100}?([\d,]+)/)
    if (m) totAssVal = num(m[1])
  }
  if (!totAmount) {
    const m = text.match(/19\.TOT\.?\s*AMOUNT[\s\S]{0,200}?([\d,]+)/)
    if (m) totAmount = num(m[1])
  }

  return { bcd, acd, sws, igst, totalDuty, fine: fine || 0, totAssVal, totAmount }
}

// ─── MANIFEST ──────────────────────────────────────────────────────────────

function parseManifest(text, lines) {
  const mfIdx = lines.findIndex(l => /1\.IGM\s+NO\s+2\.IGM\s+DATE/i.test(l))
  let igmNo, igmDate, inwDate, mawbNo, mawbDate, pkg, gw

  if (mfIdx !== -1) {
    for (let i = mfIdx + 1; i < Math.min(mfIdx + 8, lines.length); i++) {
      const l = lines[i]
      // IGM NO DATE INW DATE ... MAWB NO DATE ... PKG GW
      const m = l.match(/(\d{5,10})\s+([\d/]+)\s+([\d/]+)/)
      if (m) {
        igmNo   = m[1]
        igmDate = m[2]
        inwDate = m[3]
        // MAWB
        const mawbM = l.match(/([A-Z]{3,}[A-Z\d]{4,})\s+([\d/]+)/)
        if (mawbM) { mawbNo = mawbM[1]; mawbDate = mawbM[2] }
        // PKG and GW at end
        const pgm = l.match(/(\d{2,4})\s+([\d.]+)\s*$/)
        if (pgm) { pkg = pgm[1]; gw = pgm[2] }
        break
      }
    }
  }

  // Fallback patterns
  if (!igmNo)   igmNo   = firstMatch(text, /1\.IGM\s+NO[\s\S]{0,100}?(\d{6,10})/)
  if (!igmDate) igmDate = firstMatch(text, /2\.IGM\s+DATE[\s\S]{0,100}?([\d/]+)/)
  if (!inwDate) inwDate = firstMatch(text, /3\.INW\s+DATE[\s\S]{0,100}?([\d/]+)/)
  if (!mawbNo)  mawbNo  = firstMatch(text, /6\.MAWB\s+NO[\s\S]{0,60}?([A-Z]{3,}[A-Z\d]{4,})/)
  if (!pkg)     pkg     = firstMatch(text, /10\.PKG\s+(\d+)/)
  if (!gw)      gw      = firstMatch(text, /11\.GW[\s\S]{0,10}?([\d.]+)/)

  return { igmNo, igmDate, inwDate, mawbNo, mawbDate, pkg, gw }
}

// ─── CONTAINER ─────────────────────────────────────────────────────────────

function parseContainer(text, lines) {
  const containers = []
  const cIdx = lines.findIndex(l => /1\.SNO\s+2\.LCL/i.test(l))
  if (cIdx !== -1) {
    for (let i = cIdx + 1; i < Math.min(cIdx + 20, lines.length); i++) {
      const l = lines[i]
      // Match: SNO  FCL/LCL  TRUCK  SEAL  CONTAINER
      const m = l.match(/(\d+)\s+(F|L)\s+(\S*)\s+(\d{6,12})\s+([A-Z]{4}\d{7,})/)
      if (m) {
        containers.push({ sno: m[1], type: m[2] === 'F' ? 'FCL' : 'LCL', seal: m[4], containerNo: m[5] })
      }
    }
  }
  // Fallback
  if (!containers.length) {
    const sealM = text.match(/(\d{7,12})\s+([A-Z]{4}\d{7})/)
    if (sealM) containers.push({ sno: '1', type: 'FCL', seal: sealM[1], containerNo: sealM[2] })
  }
  return containers
}

// ─── OOC INFO ──────────────────────────────────────────────────────────────

function parseOOCInfo(text) {
  const oocNo   = firstMatch(text, /OOC\s+NO\.?\s+([\d]+)/i)
  const oocDate = firstMatch(text, /OOC\s+DATE\s+([\d\-/]+)/i)
  return { oocNo, oocDate }
}

// ─── EXCHANGE RATES ────────────────────────────────────────────────────────

function parseExchangeRates(text) {
  const rates = {}
  const matches = text.matchAll(/1\s+([A-Z]{3})\s*=\s*([\d.]+)\s*INR/g)
  for (const m of matches) rates[m[1]] = parseFloat(m[2])
  // INR = INR
  if (!rates['INR']) rates['INR'] = 1
  return rates
}

// ─── INVOICES ──────────────────────────────────────────────────────────────

function parseInvoices(text, lines) {
  const invoices = []
  const seen = new Set()

  // Pattern: S.NO  INVOICE NO  AMOUNT  CURRENCY in the INVOICE DETAILS SUMMARY section
  const invSecIdx = lines.findIndex(l => /INVOICE\s+DETAILS\s*-\s*SUMMARY/i.test(l))
  const containerIdx = lines.findIndex(l => /CONTAINER\s+DETAILS/i.test(l))
  const searchEnd = containerIdx > invSecIdx ? containerIdx : lines.length

  for (let i = Math.max(0, invSecIdx - 5); i < searchEnd; i++) {
    const l = lines[i]
    // Typical: "1  1329016372  1317.34  USD"
    const m = l.match(/\b(\d{1,2})\s+([\w\d\-\/]+(?:FOC\d*)?)\s+([\d,]+\.?\d*)\s+(USD|GBP|EUR|INR|AUD|SGD|JPY|CNY|AED|SAR)\b/)
    if (m) {
      const sno = parseInt(m[1])
      const key = m[2]
      if (!seen.has(key) && sno >= 1 && sno <= 99) {
        seen.add(key)
        invoices.push({ sno, invoiceNo: m[2], invAmt: parseFloat(m[3].replace(/,/g, '')), currency: m[4] })
      }
    }
  }

  // Sort by sno
  invoices.sort((a, b) => a.sno - b.sno)
  return invoices
}

// ─── ITEMS (PART III) ──────────────────────────────────────────────────────

function parseItems(text, lines) {
  const items = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Match item row: INVSNO ITEMSN CTH(8digits) CETH DESCRIPTION ... flags
    const m = line.match(/^\s*(\d{1,3})\s+(\d{1,4})\s+(\d{8})\s+\S+\s+(.+)/)
    if (!m) continue

    const invsno = parseInt(m[1])
    const itemsn = parseInt(m[2])
    const cth    = m[3]
    let   desc   = m[4].trim()

    // Validate: invsno and itemsn must be reasonable
    if (invsno < 1 || invsno > 999 || itemsn < 1 || itemsn > 9999) continue

    // Clean flags from description: trailing "N N Y N N" or "NOEXCISE"
    desc = desc
      .replace(/NOEXCISE\s*/gi, '')
      .replace(/\s+[NY]\s+[NY]\s+[NY]\s+[NY]\s+[NY]\s*$/i, '')
      .replace(/\s+A\.\s*$/i, '')
      .trim()

    // Try to append next line if it looks like a description continuation
    if (i + 1 < lines.length) {
      const next = lines[i + 1].trim()
      if (next && /^[A-Z0-9\(\)\-\/\s]+$/.test(next) && next.length > 5 && !/^\d{8}/.test(next)) {
        desc += ' ' + next
        desc = desc.replace(/\s+[NY]\s+[NY]\s+[NY]\s+[NY]\s+[NY]\s*$/, '').trim()
      }
    }

    // Find assess value and total duty in the next ~35 lines
    let assessValue = null, totalDuty = null
    for (let k = i; k < Math.min(i + 35, lines.length); k++) {
      if (/29\.ASSESS\s+VALUE/i.test(lines[k])) {
        // Search up to 8 lines ahead for the two numbers
        for (let offset = 1; offset <= 8; offset++) {
          if (k + offset >= lines.length) break
          const valLine = lines[k + offset]
          const vm = valLine.trim().match(/([\d,]+\.?\d+)\s+([\d,]+\.?\d+)\s*$/)
          if (vm) {
            assessValue = parseFloat(vm[1].replace(/,/g, ''))
            totalDuty   = parseFloat(vm[2].replace(/,/g, ''))
            break
          }
        }
        break
      }
    }

    if (assessValue !== null && totalDuty !== null) {
      items.push({ invsno, itemsn, cth, itemDescription: desc, assessValue, totalDuty })
    }
  }

  return items
}

// ─── VERIFICATION ──────────────────────────────────────────────────────────

export function verifyData(parsed) {
  const { header, dutySummary, items } = parsed
  const sumAV = items.reduce((s, i) => s + i.assessValue, 0)
  const sumTD = items.reduce((s, i) => s + i.totalDuty, 0)

  return {
    itemsFound:    items.length,
    itemsExpected: header.itemCount,
    itemsMatch:    items.length === header.itemCount,
    sumAssessVal:  round2(sumAV),
    headerAssessVal: dutySummary.totAssVal,
    assessValMatch:  dutySummary.totAssVal ? Math.abs(sumAV - dutySummary.totAssVal) < 2 : null,
    sumTotalDuty:  round2(sumTD),
    headerTotalDuty: dutySummary.totAmount,
    dutyMatch:       dutySummary.totAmount ? Math.abs(sumTD - dutySummary.totAmount) < 2 : null,
  }
}

// ─── EXCEL EXPORT ──────────────────────────────────────────────────────────

export async function exportToExcel(parsed, verification) {
  const XLSX = (await import('xlsx')).default || (await import('xlsx'))
  const wb   = XLSX.utils.book_new()
  const { header, status, dutySummary, manifest, container, oocInfo, exchangeRates, invoices, items } = parsed

  // Sheet 1: Summary
  const summaryData = [
    ['ICEGATE OOC Bill of Entry — Parsed Summary'],
    [],
    ['PART I — BILL OF ENTRY SUMMARY'],
    ['Field', 'Value'],
    ['Port Code',        header.portCode   || ''],
    ['Port Name',        header.portName   || ''],
    ['BE Number',        header.beNo       || ''],
    ['BE Date',          header.beDate     || ''],
    ['BE Type',          header.beType     || ''],
    ['IEC/Branch',       header.iec        || ''],
    ['GSTIN',            header.gstin      || ''],
    ['CB Code',          header.cbCode     || ''],
    ['No. of Invoices',  header.invCount   || ''],
    ['No. of Items',     header.itemCount  || ''],
    ['Packages',         header.pkg        || ''],
    ['Gross Weight (KGS)', header.gw       || ''],
    [],
    ['A. STATUS'],
    ['13. Country of Origin',      status.countryOrigin      || ''],
    ['14. Country of Consignment', status.countryConsignment || ''],
    ['15. Port of Loading',        status.portLoading        || ''],
    ['16. Port of Shipment',       status.portShipment       || ''],
    [],
    ['C. DUTY SUMMARY'],
    ['17. Fine (INR)',              dutySummary.fine          || 0],
    ['18. Total Assessable Value',  dutySummary.totAssVal     || ''],
    ['19. Total Amount (INR)',      dutySummary.totAmount     || ''],
    ['   BCD',                     dutySummary.bcd           || ''],
    ['   SWS',                     dutySummary.sws           || ''],
    ['   IGST',                    dutySummary.igst          || ''],
    [],
    ['D. MANIFEST DETAILS'],
    ['1. IGM No',     manifest.igmNo     || ''],
    ['2. IGM Date',   manifest.igmDate   || ''],
    ['3. INW Date',   manifest.inwDate   || ''],
    ['6. MAWB No',    manifest.mawbNo    || ''],
    ['7. MAWB Date',  manifest.mawbDate  || ''],
    ['10. PKG',       manifest.pkg       || ''],
    ['11. GW (KGS)',  manifest.gw        || ''],
    [],
    ['J. CONTAINER DETAILS'],
    ['S.No', 'Type', 'Seal', 'Container Number'],
    ...container.map(c => [c.sno, c.type, c.seal, c.containerNo]),
    [],
    ['OOC INFORMATION'],
    ['OOC Number', oocInfo.oocNo   || ''],
    ['OOC Date',   oocInfo.oocDate || ''],
    [],
    ['EXCHANGE RATES'],
    ...Object.entries(exchangeRates).map(([cur, rate]) => [`1 ${cur} = INR`, rate]),
    [],
    ['VERIFICATION'],
    ['Items Parsed',           verification.itemsFound],
    ['Items Expected',         verification.itemsExpected],
    ['Items Match',            verification.itemsMatch ? 'YES ✓' : 'NO ✗'],
    ['Sum Assess Value',       verification.sumAssessVal],
    ['Header Assess Value',    verification.headerAssessVal],
    ['Assess Value Match',     verification.assessValMatch === null ? 'N/A' : verification.assessValMatch ? 'YES ✓' : 'NO ✗'],
    ['Sum Total Duty',         verification.sumTotalDuty],
    ['Header Total Duty',      verification.headerTotalDuty],
    ['Duty Match',             verification.dutyMatch === null ? 'N/A' : verification.dutyMatch ? 'YES ✓' : 'NO ✗'],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary')

  // Sheet 2: Invoices
  const invTotals = {}
  items.forEach(it => {
    if (!invTotals[it.invsno]) invTotals[it.invsno] = { av: 0, td: 0, cnt: 0 }
    invTotals[it.invsno].av  += it.assessValue
    invTotals[it.invsno].td  += it.totalDuty
    invTotals[it.invsno].cnt += 1
  })
  const invRows = [
    ['S.No', 'Invoice No', 'Invoice Amount', 'Currency', 'Item Count', 'Assess Value (INR)', 'Total Duty (INR)'],
    ...invoices.map(inv => {
      const t = invTotals[inv.sno] || { av: 0, td: 0, cnt: 0 }
      return [inv.sno, inv.invoiceNo, inv.invAmt, inv.currency, t.cnt, round2(t.av), round2(t.td)]
    })
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(invRows), 'Invoices')

  // Sheet 3: Item Details
  const itemRows = [
    ['Inv S.No', 'Item S.No', 'CTH', 'Item Description', 'Assess Value (INR)', 'Total Duty (INR)'],
    ...items.map(it => [it.invsno, it.itemsn, it.cth, it.itemDescription, it.assessValue, it.totalDuty])
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(itemRows), 'Item Details')

  const beNo = parsed.header.beNo || 'OOC'
  XLSX.writeFile(wb, `OOC_BE${beNo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ─── HELPERS ───────────────────────────────────────────────────────────────

function firstMatch(text, rx) {
  const m = text.match(rx)
  return m ? m[1]?.trim() : null
}

function num(s) {
  if (!s) return null
  return parseFloat(String(s).replace(/,/g, ''))
}

function round2(n) {
  return Math.round(n * 100) / 100
}
