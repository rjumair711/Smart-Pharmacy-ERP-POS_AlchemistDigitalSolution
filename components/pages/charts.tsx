'use client'
import { useState } from 'react'
import { compact, pkr } from '@/lib/client'

/** Smooth area line chart built from real series data. */
export function LineChart({ points, labels, ariaLabel }: { points: number[]; labels: string[]; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 700, H = 200
  const max = Math.max(1, ...points) * 1.1
  const step = points.length > 1 ? W / (points.length - 1) : W
  const xy = points.map((v, i) => [i * step, H - (v / max) * H] as const)
  const line = xy.map(([x, y], i) => {
    if (i === 0) return `M${x} ${y}`
    const [px, py] = xy[i - 1]
    const cx = (px + x) / 2
    return `C${cx} ${py} ${cx} ${y} ${x} ${y}`
  }).join(' ')
  const ticks = [1, 0.75, 0.5, 0.25, 0].map(t => compact(max * t))
  const labelEvery = Math.max(1, Math.ceil(labels.length / 7))
  return <div className="line-chart">
    <div className="chart-y-labels">{ticks.map((t, i) => <span key={i}>{t}</span>)}</div>
    <div className="chart-plot" onMouseLeave={() => setHover(null)}>
      <div className="chart-gridlines"><i /><i /><i /><i /><i /></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={ariaLabel}
        onMouseMove={e => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); setHover(Math.min(points.length - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * (points.length - 1))))) }}>
        <defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#12a77a" stopOpacity=".16" /><stop offset="100%" stopColor="#12a77a" stopOpacity="0" /></linearGradient></defs>
        {points.length > 0 && <path d={`${line} L${W} ${H} L0 ${H}Z`} fill="url(#areaFill)" />}
        <path d={line} fill="none" stroke="#07966f" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        {hover !== null && xy[hover] && <><line x1={xy[hover][0]} x2={xy[hover][0]} y1={0} y2={H} stroke="#cfdcd8" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" /><circle cx={xy[hover][0]} cy={xy[hover][1]} r="5" fill="white" stroke="#07966f" strokeWidth="3" vectorEffect="non-scaling-stroke" /></>}
      </svg>
      {hover !== null && <div className="chart-tooltip" style={{ left: `${(hover / Math.max(1, points.length - 1)) * 100}%` }}><strong>{pkr(points[hover])}</strong><small>{labels[hover]}</small></div>}
      <div className="chart-x-labels">{labels.map((l, i) => i % labelEvery === 0 || i === labels.length - 1 ? <span key={i}>{l}</span> : null)}</div>
    </div>
  </div>
}

export const DONUT_COLORS = ['#078c68', '#5e9fca', '#9fcdbb', '#e0b45c', '#a78bda', '#dce8e2']

export function Donut({ rows, total, caption }: { rows: { label: string; value: number }[]; total: number; caption: string }) {
  const top = rows.slice(0, 5)
  const rest = rows.slice(5).reduce((s, r) => s + r.value, 0)
  const parts = rest > 0 ? [...top, { label: 'Other', value: rest }] : top
  let acc = 0
  const stops = parts.map((p, i) => { const from = acc; acc += total ? (p.value / total) * 100 : 0; return `${DONUT_COLORS[i]} ${from}% ${acc}%` })
  return <>
    <div className="donut-wrap"><div className="donut" style={{ background: total ? `conic-gradient(${stops.join(',')})` : '#edf1f0' }}><div className="donut-center"><strong>PKR {compact(total)}</strong><small>{caption}</small></div></div></div>
    <div className="category-legend">{parts.length ? parts.map((p, i) => <span key={p.label}><i className="dot" style={{ background: DONUT_COLORS[i] }} /> {p.label} <b>{total ? Math.round((p.value / total) * 100) : 0}%</b></span>) : <span>No sales yet</span>}</div>
  </>
}

export function BarChart({ rows }: { rows: { label: string; a: number; b: number }[] }) {
  const max = Math.max(1, ...rows.map(r => Math.max(r.a, r.b)))
  const labelEvery = Math.max(1, Math.ceil(rows.length / 12))
  return <div className="bar-chart">{rows.map((r, i) => <div className="bar-group" key={i} title={`${r.label}: revenue ${pkr(r.a)} · profit ${pkr(r.b)}`}><div className="bar-pair"><i style={{ height: `${(r.a / max) * 100}%` }} /><i style={{ height: `${(Math.max(0, r.b) / max) * 100}%` }} /></div><small>{i % labelEvery === 0 ? r.label : ''}</small></div>)}</div>
}
