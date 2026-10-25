/** Shared bits for the dashboard widgets (docs/09 §6, §7.2). */

/** Choreography start of widget `i` in reading order: 150ms + i × 45ms (docs/09 §7.2). */
export const startAt = (i: number): number => 150 + i * 45

/** Bill status → chip tone, glyph (docs/09 §4.8) and the row's status colour (one map for every page). */
export { BILL_STATUS as STATUS } from '../../components/billStatus'
