# Référentiel skills SINAPSE v3

Cette v3 part du fichier v2 et vise un objectif simple : conserver la structure validée, tout en rendant le référentiel plus discriminant, plus cohérent entre catégories, et moins redondant sur les compétences transverses.

## Principaux changements

- Renforcement de 5 scénarios pour les rendre plus situationnels et mieux alignés avec les tensions réelles du programme : arbitrage, bascule, coexistence legacy/cible, continuité d'équipe, exploitabilité.
- Clarification de la frontière entre management et pilotage projet :
  - `management-leadership / multi-stakeholder-piloting` devient `Pilotage de Gouvernance Multi-Parties Prenantes`
  - `project-management-pmo / stakeholder-engagement` devient `Engagement des Parties Prenantes Projet`
- Recentrage du skill CDC sur des capacités observables aux niveaux 1-3, avec les outils cités comme exemples plutôt que comme prérequis implicites.
- Clarification de la frontière entre UX produit et accompagnement au déploiement :
  - `change-management-training / external-user-accompaniment` devient `Accompagnement au Déploiement des Usagers Externes`
- Clarification de la frontière entre CL, exploitation batch et intégration legacy :
  - `legacy-ibmi-adelia / batch-scheduling-operations` devient `Exploitation & Ordonnancement Batch`
  - ajustements mineurs sur `cl-control-language` et `legacy-batch-interfaces`
- Ajustement de `analyse-fonctionnelle / functional-testing` pour éviter le recouvrement avec la catégorie locked QA.
- Harmonisation rédactionnelle légère : correction de termes comme `Architécte` et `policies`.

## Intention de design

La v3 cherche à améliorer la qualité de l'auto-positionnement sans relancer un chantier complet de refonte. Les changements sont donc ciblés :

- garder les catégories et la volumétrie stables
- corriger les recouvrements les plus probables
- rendre les niveaux 3-5 plus ancrés dans SINAPSE
- conserver une lecture simple pour un répondant non expert du référentiel

## Fichier produit

- JSON v3 : `specs/010-pole-separation/referentiel_skills_sinapse_v3.json`
