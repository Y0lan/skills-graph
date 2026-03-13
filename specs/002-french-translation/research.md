# Research: French-Only Translation

**Date**: 2026-03-09 | **Branch**: `002-french-translation`

## Rating Level Names

**Decision**: Use the following French equivalents for the 6 rating levels:

| English | French | Rationale |
|---------|--------|-----------|
| Unknown | Inconnu | Standard translation |
| Awareness | Notions | "Notions" conveys basic familiarity better than "Conscience" in a skills context |
| Guided | Guidé | Direct translation, commonly used in competency frameworks |
| Autonomous | Autonome | Direct translation |
| Advanced | Avancé | Direct translation |
| Expert | Expert | Same in French |

**Alternatives considered**: "Découverte" for Awareness (rejected — implies active exploration rather than passive knowledge). "Confirmé" for Advanced (rejected — "Avancé" is more standard in competency grids).

## Date Formatting

**Decision**: Use `toLocaleDateString('fr-FR')` / `toLocaleString('fr-FR')` for all date displays.

**Rationale**: Native browser Intl API handles French date formatting correctly (e.g., "9 mars 2026"). No external library needed.

## Calibration Prompts Translation Approach

**Decision**: Translate the full scenario text while preserving technical terms inline.

**Rationale**: The calibration prompts describe realistic work scenarios. The French translation must read naturally while keeping tool/product names (GitLab CI, AG Grid, Keycloak, etc.) in their original form since the team uses these tools daily.

## Skill Descriptors Translation Approach

**Decision**: Translate each descriptor individually, preserving technical terms and tool names.

**Rationale**: Each descriptor is a 1-2 sentence competency statement. The French version must be precise enough for consistent self-assessment across team members. Domain-specific terms (JVM, GC tuning, sealed classes, etc.) stay in English as they are universally understood by developers.

## No i18n Framework Needed

**Decision**: Hardcode all French strings directly in source files.

**Rationale**: The app serves a single French-speaking team with no plans for multi-language support. Adding react-i18next or similar would violate the constitution's Simplicity First principle and add unnecessary complexity for zero benefit.

**Alternatives considered**: react-i18next (rejected — overkill for single-language app, adds bundle size and abstraction layer).
