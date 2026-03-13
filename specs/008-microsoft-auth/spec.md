# Feature Spec: Authentification Microsoft 365

**Branch**: `008-microsoft-auth` | **Date**: 2026-03-12

## Problem

L'application est actuellement ouverte sans aucune authentification. N'importe qui avec l'URL peut voir et modifier les évaluations de n'importe quel membre. Il faut :

1. Restreindre l'accès aux formulaires aux seuls membres authentifiés (chacun ne peut modifier que le sien)
2. Permettre à tous (guests inclus) de consulter le dashboard
3. Récupérer les avatars, emails et noms depuis Microsoft 365 / Entra ID

## Requirements

### R1 — Deux modes d'accès

- **GUEST** (non connecté) : peut visualiser le dashboard (toutes les vues, radar, heatmap, expert finder) mais ne peut PAS accéder aux formulaires d'évaluation
- **MEMBRE** (connecté via Microsoft 365) : peut visualiser le dashboard ET accéder/modifier **uniquement son propre** formulaire d'évaluation

### R2 — Connexion Microsoft 365

- Authentification via Microsoft Entra ID (Azure AD) OAuth 2.0
- Domaine autorisé : `@sinapse.nc`
- Flux PKCE (SPA) côté frontend
- Récupération du profil via Microsoft Graph API : nom, email, photo/avatar

### R3 — Liaison des comptes

Associer les comptes Microsoft aux membres existants du roster via email :

| Membre | Email |
|--------|-------|
| Pierre ROSSATO | pierre.rossato@sinapse.nc |
| Andy MALO | andy.malo@sinapse.nc |
| Martin VALLET | martin.vallet@sinapse.nc |
| Pierre-Mathieu BARRAS | pierre-mathieu.barras@sinapse.nc |
| Nicole NGUON | nicole.nguon@sinapse.nc |
| Alan HUITEL | alan.huitel@sinapse.nc |
| Bethlehem MENGISTU | bethlehem.mengistu@sinapse.nc |
| Alexandre THOMAS | alexandre.thomas@sinapse.nc |
| Matthieu ALCIME | matthieu.alcime@sinapse.nc |
| Steven NGUYEN | steven.nguyen@sinapse.nc |

### R4 — UX d'accueil

- Page d'accueil / dashboard : accessible sans connexion
- Bouton "Se connecter" dans le header (Microsoft logo)
- Après connexion : avatar + nom dans le header, lien direct vers "Mon formulaire"
- Bouton "Se déconnecter"

### R5 — Protection des routes

- `/dashboard` et `/dashboard/:slug` : accessibles à tous (GUEST + MEMBRE)
- `/form/:slug` : accessible uniquement au MEMBRE dont le slug correspond au compte connecté
- Tentative d'accès non autorisé → redirection vers page de connexion ou message d'erreur

### R6 — Avatars dans le dashboard

- Afficher les photos Microsoft 365 des membres dans le dashboard (grille, expert finder, profils)
- Fallback : initiales si pas de photo disponible

## Out of Scope

- Gestion des rôles admin / manager
- Inscription de nouveaux membres (roster reste hardcodé)
- MFA / conditional access policies (délégué à Entra ID)
