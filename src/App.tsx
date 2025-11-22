import React, { useEffect, useMemo, useState } from 'react'

type Lang = 'zh' | 'en'

type SeatStatus = 'idle' | 'seated' | 'rest'

interface SeatState {
  id: number
  memberId: string
  status: SeatStatus
  activeSeconds: number
  restSeconds: number
  buyIn: number
  joinCount: number
  lastTickTs: number | null
  selected: boolean
}

interface TableState {
  id: number
  name: string
  isRunning: boolean
  openedAt: string | null
  closedAt: string | null
  tableSeconds: number
  lastTickTs: number | null
  seats: SeatState[]
}

const TABLE_COUNT = 4
const SEATS_PER_TABLE = 9
const TICK_INTERVAL = 1000

function nowTs() {
  return Date.now()
}

function formatHMS(totalSeconds: number): string {
  const sec = Math.floor(totalSeconds)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function formatDateTime(d: Date | null): string {
  if (!d) return '-'
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  const hr24 = d.getHours()
  const isPM = hr24 >= 12
  const hr12 = hr24 % 12 || 12
  const mi = `${d.getMinutes()}`.padStart(2, '0')
  const ampm = isPM ? '下午' : '上午'
  return `${y}/${m}/${day} ${ampm}${hr12}:${mi}`
}

function usePersistentState<T>(key: string, initial: () => T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initial()
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) return initial()
      return JSON.parse(raw) as T
    } catch {
      return initial()
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [key, state])

  return [state, setState]
}

function createInitialSeat(id: number): SeatState {
  return {
    id,
    memberId: '',
    status: 'idle',
    activeSeconds: 0,
    restSeconds: 0,
    buyIn: 0,
    joinCount: 0,
    lastTickTs: null,
    selected: false,
  }
}

function createInitialTable(id: number): TableState {
  return {
    id,
    name: `Table ${id}`,
    isRunning: false,
    openedAt: null,
    closedAt: null,
    tableSeconds: 0,
    lastTickTs: null,
    seats: Array.from({ length: SEATS_PER_TABLE }, (_, i) => createInitialSeat(i + 1)),
  }
}

const App: React.FC = () => {
  const [lang, setLang] = usePersistentState<Lang>('everwin_lang', () => 'zh')
  const [tables, setTables] = usePersistentState<TableState[]>('everwin_tables_v2', () =>
    Array.from({ length: TABLE_COUNT }, (_, i) => createInitialTable(i + 1)),
  )
  const [currentTableIndex, setCurrentTableIndex] = usePersistentState<number>('everwin_current_table', () => 0)

  // keep current index valid
  useEffect(() => {
    if (currentTableIndex < 0 || currentTableIndex >= tables.length) {
      setCurrentTableIndex(0)
    }
  }, [currentTableIndex, tables.length, setCurrentTableIndex])

  const currentTable = tables[Math.max(0, Math.min(currentTableIndex, tables.length - 1))]

  // global ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setTables(prev => {
        const ts = nowTs()
        return prev.map(table => {
          if (!table.isRunning) {
            return {
              ...table,
              lastTickTs: ts,
              seats: table.seats.map(s => ({ ...s, lastTickTs: ts })),
            }
          }

          const lastTs = table.lastTickTs ?? ts
          const deltaSec = (ts - lastTs) / 1000

          const updatedSeats = table.seats.map(seat => {
            const seatLast = seat.lastTickTs ?? ts
            const seatDelta = (ts - seatLast) / 1000
            if (seat.status === 'seated') {
              return {
                ...seat,
                activeSeconds: seat.activeSeconds + seatDelta,
                lastTickTs: ts,
              }
            }
            if (seat.status === 'rest') {
              return {
                ...seat,
                restSeconds: seat.restSeconds + seatDelta,
                lastTickTs: ts,
              }
            }
            return { ...seat, lastTickTs: ts }
          })

          return {
            ...table,
            tableSeconds: table.tableSeconds + deltaSec,
            lastTickTs: ts,
            seats: updatedSeats,
          }
        })
      })
    }, TICK_INTERVAL)

    return () => clearInterval(timer)
  }, [setTables])

  const toggleLang = () => setLang(prev => (prev === 'zh' ? 'en' : 'zh'))

  const t = (key: string): string => {
    const dict: Record<string, { zh: string; en: string }> = {
      title: { zh: 'EVERWIN 撲克桌邊管理系統', en: 'EVERWIN Poker Table Manager' },
      subtitle: {
        zh: '多桌中央牌桌時鐘＋9座位上桌計時，適用於現場牌桌經理管理玩家時數與買籌碼記錄。本機儲存：每台裝置各自獨立紀錄。',
        en: 'Multi-table central clock with 9-seat timers, designed for table managers to track player time and buy-ins. Local only: each device keeps its own records.',
      },
      today: { zh: '今天', en: 'Today' },
      tableLabel: { zh: '桌號', en: 'Table' },
      statusRunning: { zh: '運行中', en: 'Running' },
      statusStopped: { zh: '未開桌', en: 'Stopped' },
      start: { zh: '開桌 / 繼續', en: 'Start / Resume' },
      pause: { zh: '暫停牌桌', en: 'Pause' },
      stop: { zh: '關桌', en: 'Close Table' },
      exportCsv: { zh: '匯出本局 CSV', en: 'Export CSV' },
      resetTable: { zh: 'Reset 本桌', en: 'Reset Table' },
      batchSeat: { zh: '批次上桌', en: 'Batch Seat' },
      batchLeave: { zh: '批次下桌', en: 'Batch Leave' },
      openedAt: { zh: '開桌時間', en: 'Opened at' },
      closedAt: { zh: '關桌時間', en: 'Closed at' },
      tableDuration: { zh: '本局時長', en: 'Session duration' },
      langSwitch: { zh: '切換為英文 (中文)', en: 'Switch to Chinese (EN)' },
      seat: { zh: '座位', en: 'Seat' },
      memberId: { zh: '會員ID', en: 'Member ID' },
      seatEmpty: { zh: '空位 / 未上桌', en: 'Empty / Not seated' },
      seatSeated: { zh: '上桌中', en: 'Seated' },
      seatRest: { zh: '休息中', en: 'Resting' },
      todayTotal: { zh: '今日累積', en: 'Today total' },
      todayTimes: { zh: '今日上桌次數', en: '# of sits' },
      seatBtnSeat: { zh: '上桌', en: 'Seat' },
      seatBtnRest: { zh: '休息', en: 'Rest' },
      seatBtnLeave: { zh: '下桌', en: 'Leave' },
      seatBtnBuy: { zh: '加買籌碼', en: 'Add chips' },
      buyIn: { zh: '買籌碼', en: 'Buy-in' },
      restSeconds: { zh: '休息秒數', en: 'Rest sec' },
      occupancy: { zh: '佔桌率', en: 'Share' },
      batchLabel: { zh: '批次', en: 'Batch' },
    }
    return dict[key]?.[lang] ?? key
  }

  const todayStr = useMemo(() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = `${d.getMonth() + 1}`.padStart(2, '0')
    const day = `${d.getDate()}`.padStart(2, '0')
    return `${y}-${m}-${day}`
  }, [])

  const handleStartTable = () => {
    setTables(prev =>
      prev.map((tbl, idx) => {
        if (idx !== currentTableIndex) return tbl
        if (tbl.isRunning) return tbl
        const openedAt = tbl.openedAt ?? formatDateTime(new Date())
        const ts = nowTs()
        return {
          ...tbl,
          isRunning: true,
          openedAt,
          closedAt: null,
          lastTickTs: ts,
          seats: tbl.seats.map(s => ({ ...s, lastTickTs: ts })),
        }
      }),
    )
  }

  const handlePauseTable = () => {
    setTables(prev =>
      prev.map((tbl, idx) => {
        if (idx !== currentTableIndex) return tbl
        return {
          ...tbl,
          isRunning: false,
        }
      }),
    )
  }

  const handleStopTable = () => {
    if (!window.confirm('確定要關閉本桌嗎？關桌後計時將停止，但資料仍保留，可匯出 CSV。')) return
    setTables(prev =>
      prev.map((tbl, idx) => {
        if (idx !== currentTableIndex) return tbl
        return {
          ...tbl,
          isRunning: false,
          closedAt: formatDateTime(new Date()),
        }
      }),
    )
  }

  const handleResetTable = () => {
    if (!window.confirm('此動作會清空本桌的所有紀錄（含玩家紀錄）。建議先匯出 CSV，再進行 Reset。本動作無法復原，確定要執行嗎？')) {
      return
    }
    setTables(prev =>
      prev.map((tbl, idx) => {
        if (idx !== currentTableIndex) return tbl
        return createInitialTable(tbl.id)
      }),
    )
  }

  const guardRunning = (): boolean => {
    const tbl = currentTable
    if (!tbl.isRunning) {
      window.alert('請先運營開桌再進行此操作。')
      return false
    }
    return true
  }

  const updateSeat = (seatId: number, updater: (s: SeatState, table: TableState) => SeatState) => {
    setTables(prev =>
      prev.map((tbl, idx) => {
        if (idx !== currentTableIndex) return tbl
        return {
          ...tbl,
          seats: tbl.seats.map(s => (s.id === seatId ? updater(s, tbl) : s)),
        }
      }),
    )
  }

  const handleSeat = (seat: SeatState) => {
    if (!guardRunning()) return
    updateSeat(seat.id, (s, tbl) => {
      if (s.status === 'seated') return s
      const ts = nowTs()
      return {
        ...s,
        status: 'seated',
        joinCount: s.joinCount + 1,
        lastTickTs: ts,
      }
    })
  }

  const handleRest = (seat: SeatState) => {
    if (!guardRunning()) return
    updateSeat(seat.id, (s, tbl) => {
      if (s.status === 'rest') return s
      const ts = nowTs()
      return {
        ...s,
        status: 'rest',
        lastTickTs: ts,
      }
    })
  }

  const handleLeave = (seat: SeatState) => {
    updateSeat(seat.id, (s, tbl) => ({
      ...s,
      status: 'idle',
      lastTickTs: nowTs(),
      selected: false,
    }))
  }

  const handleBuyIn = (seat: SeatState) => {
    const input = window.prompt('請輸入本次加買籌碼金額（數字）：', '0')
    if (!input) return
    const val = Number(input)
    if (!Number.isFinite(val) || val <= 0) {
      window.alert('請輸入大於 0 的數字。')
      return
    }
    updateSeat(seat.id, s => ({
      ...s,
      buyIn: s.buyIn + val,
    }))
  }

  const toggleSeatSelected = (seatId: number) => {
    updateSeat(seatId, s => ({
      ...s,
      selected: !s.selected,
    }))
  }

  const handleBatchSeat = () => {
    if (!guardRunning()) return
    setTables(prev =>
      prev.map((tbl, idx) => {
        if (idx !== currentTableIndex) return tbl
        const ts = nowTs()
        return {
          ...tbl,
          seats: tbl.seats.map(s =>
            s.selected
              ? {
                  ...s,
                  status: 'seated',
                  joinCount: s.joinCount + 1,
                  lastTickTs: ts,
                }
              : s,
          ),
        }
      }),
    )
  }

  const handleBatchLeave = () => {
    setTables(prev =>
      prev.map((tbl, idx) => {
        if (idx !== currentTableIndex) return tbl
        const ts = nowTs()
        return {
          ...tbl,
          seats: tbl.seats.map(s =>
            s.selected
              ? {
                  ...s,
                  status: 'idle',
                  lastTickTs: ts,
                  selected: false,
                }
              : s,
          ),
        }
      }),
    )
  }

  const handleMemberIdChange = (seatId: number, value: string) => {
    updateSeat(seatId, s => ({
      ...s,
      memberId: value,
    }))
  }

  // CSV export
  const handleExportCsv = () => {
    const tbl = currentTable
    if (!tbl) return

    const tableOpenedAt = tbl.openedAt ?? '-'
    const tableClosedAt = tbl.closedAt ?? '-'
    const tableDurationSec = tbl.tableSeconds
    const totalActiveSeconds = tbl.seats.reduce((sum, s) => sum + s.activeSeconds, 0)

    const headerLines = [
      `Table,${tbl.name}`,
      `Opened At,${tableOpenedAt}`,
      `Closed At,${tableClosedAt}`,
      `Session Seconds,${Math.floor(tableDurationSec)},Formatted,${formatHMS(tableDurationSec)}`,
      `Total Active Seconds (All Seats),${Math.floor(totalActiveSeconds)}`,
      '',
    ]

    const columns = [
      'Date',
      'Table',
      'Seat',
      'MemberID',
      'Status',
      'ActiveSeconds',
      'ActiveTime(HH:MM:SS)',
      'RestSeconds',
      'BuyIn',
      'JoinCount',
      'OccupancyShare',
    ]

    const date = todayStr

    const rows = tbl.seats.map(s => {
      const share = totalActiveSeconds > 0 ? s.activeSeconds / totalActiveSeconds : 0
      return [
        date,
        tbl.name,
        String(s.id),
        s.memberId || '',
        s.status,
        String(Math.floor(s.activeSeconds)),
        formatHMS(s.activeSeconds),
        String(Math.floor(s.restSeconds)),
        String(s.buyIn),
        String(s.joinCount),
        share > 0 ? (share * 100).toFixed(1) + '%' : '',
      ]
    })

    const csvLines: string[] = []
    csvLines.push(...headerLines)
    csvLines.push(columns.join(','))
    for (const r of rows) {
      csvLines.push(r.map(v => `"${v.replace(/"/g, '""')}"`).join(','))
    }

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const dateTag = todayStr.replace(/-/g, '')
    a.download = `PokerSessions_${tbl.name}_${dateTag}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const totalActiveSeconds = currentTable.seats.reduce((sum, s) => sum + s.activeSeconds, 0)

  return (
    <div className="app-root">
      <div className="app-shell">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <div className="app-header-title">EVERWIN Poker Table Manager</div>
            <div className="app-subtitle">{t('subtitle')}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <button className="lang-toggle" onClick={toggleLang}>
              {t('langSwitch')}
            </button>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              {t('today')}：{todayStr}
            </div>
          </div>
        </header>

        <main className="layout-main">
          {/* Left: table clock & controls */}
          <section className="table-panel">
            <div className="table-selector-row">
              <span className="table-label">{t('tableLabel')}</span>

              {/* mobile: select */}
              <select
                className="table-select"
                value={currentTableIndex}
                onChange={e => setCurrentTableIndex(Number(e.target.value))}
              >
                {tables.map((tbl, idx) => (
                  <option key={tbl.id} value={idx}>
                    {tbl.name}
                  </option>
                ))}
              </select>

              {/* desktop: tabs */}
              <div className="table-tabs">
                {tables.map((tbl, idx) => (
                  <button
                    key={tbl.id}
                    className={
                      'table-tab ' + (idx === currentTableIndex ? 'table-tab-active' : '')
                    }
                    onClick={() => setCurrentTableIndex(idx)}
                  >
                    {tbl.name}
                  </button>
                ))}
              </div>

              <span style={{ flex: 1 }} />

              <span className="badge-status">
                {currentTable.isRunning ? t('statusRunning') : t('statusStopped')}
              </span>
            </div>

            <div className="clock-display">{formatHMS(currentTable.tableSeconds)}</div>

            <div className="clock-meta-row">
              {t('openedAt')}：{currentTable.openedAt ?? '-'}
            </div>
            <div className="clock-meta-row">
              {t('closedAt')}：{currentTable.closedAt ?? '-'}
            </div>
            <div className="clock-meta-row">
              {t('tableDuration')}：{formatHMS(currentTable.tableSeconds)}
            </div>
            <div className="clock-meta-row">
              {t('occupancy')}：{totalActiveSeconds > 0 ? formatHMS(totalActiveSeconds) : '00:00:00'}（全桌總上桌時數）
            </div>

            <div className="btn-row">
              <button className="btn-pill btn-start" onClick={handleStartTable} disabled={currentTable.isRunning}>
                {t('start')}
              </button>
              <button className="btn-pill btn-pause" onClick={handlePauseTable} disabled={!currentTable.isRunning}>
                {t('pause')}
              </button>
              <button className="btn-pill btn-stop" onClick={handleStopTable}>
                {t('stop')}
              </button>
            </div>

            <div className="btn-row" style={{ marginTop: 16 }}>
              <button className="btn-secondary" onClick={handleExportCsv}>
                {t('exportCsv')}
              </button>
              <button className="btn-secondary" onClick={handleResetTable}>
                {t('resetTable')}
              </button>
            </div>

            <div className="btn-row" style={{ marginTop: 16 }}>
              <button className="btn-secondary" onClick={handleBatchSeat}>
                {t('batchSeat')}
              </button>
              <button className="btn-secondary" onClick={handleBatchLeave}>
                {t('batchLeave')}
              </button>
            </div>
          </section>

          {/* Right: seats */}
          <section className="seats-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div className="chip">
                <span className="chip-dot" />
                <span style={{ fontWeight: 600, fontSize: 12 }}>{currentTable.name}</span>
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                {t('occupancy')}：
                {totalActiveSeconds > 0 ? formatHMS(totalActiveSeconds) : '00:00:00'}
              </div>
            </div>

            <div className="seats-grid">
              {currentTable.seats.map(seat => {
                const statusLabel =
                  seat.status === 'seated' ? t('seatSeated') : seat.status === 'rest' ? t('seatRest') : t('seatEmpty')
                const statusColor =
                  seat.status === 'seated'
                    ? '#22c55e'
                    : seat.status === 'rest'
                    ? '#facc15'
                    : 'rgba(148,163,184,0.6)'

                const share =
                  totalActiveSeconds > 0 && seat.activeSeconds > 0
                    ? ((seat.activeSeconds / totalActiveSeconds) * 100).toFixed(1) + '%'
                    : '-'

                return (
                  <div key={seat.id} className="seat-card">
                    <div className="seat-header-row">
                      <div>
                        <div>
                          {t('seat')} {seat.id}
                        </div>
                        <div style={{ marginTop: 2 }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 999,
                              border: `1px solid ${statusColor}`,
                              color: statusColor,
                              fontSize: 10,
                            }}
                          >
                            {statusLabel}
                          </span>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, marginBottom: 2 }}>{t('memberId')}</div>
                        <input
                          className="seat-id-input"
                          value={seat.memberId}
                          onChange={e => handleMemberIdChange(seat.id, e.target.value)}
                          placeholder=""
                        />
                      </div>
                    </div>

                    <div className="seat-timer">{formatHMS(seat.activeSeconds)}</div>

                    <div className="seat-meta-row">
                      {t('todayTotal')}：{formatHMS(seat.activeSeconds)}　{t('todayTimes')}：{seat.joinCount}
                    </div>
                    <div className="seat-meta-row">
                      {t('buyIn')}：{seat.buyIn}　{t('restSeconds')}：{Math.floor(seat.restSeconds)}
                    </div>

                    <div className="seat-buttons-row">
                      <button className="seat-btn seat-btn-green" onClick={() => handleSeat(seat)}>
                        {t('seatBtnSeat')}
                      </button>
                      <button className="seat-btn seat-btn-yellow" onClick={() => handleRest(seat)}>
                        {t('seatBtnRest')}
                      </button>
                      <button className="seat-btn seat-btn-red" onClick={() => handleLeave(seat)}>
                        {t('seatBtnLeave')}
                      </button>
                      <button className="seat-btn seat-btn-blue" onClick={() => handleBuyIn(seat)}>
                        {t('seatBtnBuy')}
                      </button>
                    </div>

                    <div className="seat-footer-row">
                      <div>
                        {t('occupancy')}：{share}
                      </div>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={seat.selected}
                          onChange={() => toggleSeatSelected(seat.id)}
                        />
                        <span>{t('batchLabel')}</span>
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export default App
