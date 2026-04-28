import { describe, it, expect } from 'vitest'
import { classifyLocation, LOCATION_BUCKET_LABELS } from '../location'

/**
 * Demo ask (April 2026): pipeline filter for Nouméa / NC (rest) /
 * France / International / Inconnu. Codex P15+P16+P17 reshaped the
 * classifier to use a city allowlist with city precedence over country
 * (since NC is administratively French and CV extraction may emit
 * country=France for NC addresses).
 */
describe('classifyLocation', () => {
  it('Nouméa is detected with any spelling / accent / case', () => {
    expect(classifyLocation('Nouméa', 'Nouvelle-Calédonie')).toBe('noumea')
    expect(classifyLocation('Noumea', null)).toBe('noumea')
    expect(classifyLocation('nouméa', 'France')).toBe('noumea') // NC > France
    expect(classifyLocation('NOUMÉA', null)).toBe('noumea')
  })

  it('NC city allowlist resolves to nc_outside even with country=null', () => {
    // Codex P16: Dumbéa, Païta, Mont-Dore are unambiguous NC signals;
    // the recruiter shouldn\'t need country to be filled.
    expect(classifyLocation('Dumbéa', null)).toBe('nc_outside')
    expect(classifyLocation('Païta', null)).toBe('nc_outside')
    expect(classifyLocation('Mont-Dore', null)).toBe('nc_outside')
    expect(classifyLocation('Mont Dore', null)).toBe('nc_outside') // space variant
    expect(classifyLocation('Lifou', null)).toBe('nc_outside')
    expect(classifyLocation('Bourail', null)).toBe('nc_outside')
    expect(classifyLocation('Koné', null)).toBe('nc_outside')
    expect(classifyLocation('Wé', null)).toBe('nc_outside') // capitale Lifou
  })

  it('NC city + country=France still resolves to NC, not France (codex P17)', () => {
    // NC is administratively French. CV extraction can emit
    // country=France for NC addresses; the city-precedence rule keeps
    // these candidates correctly bucketed as NC.
    expect(classifyLocation('Dumbéa', 'France')).toBe('nc_outside')
    expect(classifyLocation('Nouméa', 'France')).toBe('noumea')
  })

  it('country fallback when city is not in allowlist', () => {
    expect(classifyLocation('Saint-Louis', 'Nouvelle-Calédonie')).toBe('nc_outside')
    expect(classifyLocation('SmallVillage', 'New Caledonia')).toBe('nc_outside')
    expect(classifyLocation(null, 'NC')).toBe('nc_outside')
  })

  it('France classification', () => {
    expect(classifyLocation('Paris', 'France')).toBe('france')
    expect(classifyLocation('Lyon', 'Métropole')).toBe('france')
    expect(classifyLocation('Bordeaux', 'FR')).toBe('france')
  })

  it('international: country set, not NC, not France', () => {
    expect(classifyLocation('Sydney', 'Australia')).toBe('international')
    expect(classifyLocation('Auckland', 'New Zealand')).toBe('international')
    expect(classifyLocation('Tokyo', 'Japan')).toBe('international')
  })

  it('unknown: country missing and city not in NC allowlist', () => {
    expect(classifyLocation(null, null)).toBe('unknown')
    expect(classifyLocation('Bordeaux', null)).toBe('unknown') // could be France OR Texas
    expect(classifyLocation('', '')).toBe('unknown')
    expect(classifyLocation('   ', '   ')).toBe('unknown')
  })

  it('handles accents in country names', () => {
    expect(classifyLocation('Voh', 'NOUVELLE-CALÉDONIE')).toBe('nc_outside')
    expect(classifyLocation(null, 'nouvelle-calédonie')).toBe('nc_outside')
  })

  it('LOCATION_BUCKET_LABELS covers every bucket with a French label', () => {
    expect(LOCATION_BUCKET_LABELS.noumea).toBe('Nouméa')
    expect(LOCATION_BUCKET_LABELS.nc_outside).toBe('NC (reste)')
    expect(LOCATION_BUCKET_LABELS.france).toBe('France')
    expect(LOCATION_BUCKET_LABELS.international).toBe('International')
    expect(LOCATION_BUCKET_LABELS.unknown).toBe('Inconnu')
  })
})
