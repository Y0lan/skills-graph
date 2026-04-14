/**
 * Maps known @sinapse.nc emails to team member slugs.
 * When a user signs up via magic link, their email is matched here
 * to link them to the correct team member profile.
 */
export const KNOWN_MAPPINGS: Record<string, string> = {
  'yolan.maldonado@sinapse.nc': 'yolan-maldonado',
  'alexandre.thomas@sinapse.nc': 'alexandre-thomas',
  'alan.huitel@sinapse.nc': 'alan-huitel',
  'pierre-mathieu.barras@sinapse.nc': 'pierre-mathieu-barras',
  'andy.malo@sinapse.nc': 'andy-malo',
  'steven.nguyen@sinapse.nc': 'steven-nguyen',
  'matthieu.alcime@sinapse.nc': 'matthieu-alcime',
  'martin.vallet@sinapse.nc': 'martin-vallet',
  'nicole.nguon@sinapse.nc': 'nicole-nguon',
  'bethlehem.mengistu@sinapse.nc': 'bethlehem-mengistu',
  'pierre.rossato@sinapse.nc': 'pierre-rossato',
  'olivier.faivre@sinapse.nc': 'olivier-faivre',
  'guillaume.benoit@sinapse.nc': 'guillaume-benoit',
  'nicolas.dufillot@sinapse.nc': 'nicolas-dufillot',
  'nicolas.eppe@sinapse.nc': 'nicolas-eppe',
  'leila.benakezouh@sinapse.nc': 'leila-benakezouh',
  'sonalie.taconet@sinapse.nc': 'sonalie-taconet',
  'amine.bouali@sinapse.nc': 'amine-bouali',
  'audrey.queau@sinapse.nc': 'audrey-queau',
  // Test users — all point to yolan's email, slug selected at login
  'test.ba@sinapse.nc': 'test-ba',
  'test.legacy@sinapse.nc': 'test-legacy',
  'test.modern@sinapse.nc': 'test-modern',
  'test.direction@sinapse.nc': 'test-direction',
}
