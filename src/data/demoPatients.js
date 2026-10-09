import avaFixture from './fixtures/ava.json'
import meiFixture from './fixtures/mei.json'
import sofiaFixture from './fixtures/sofia.json'
import { DEMO_DATE, normaliseDemoPatient } from './demoPatientModel'

export { DEMO_DATE }

export const demoPatients = [
  normaliseDemoPatient(avaFixture, 'Ava Chen'),
  normaliseDemoPatient(meiFixture, 'Mei Lin'),
  normaliseDemoPatient(sofiaFixture, 'Sofia R.'),
]
