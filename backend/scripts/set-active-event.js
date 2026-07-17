/**
 * Script to set the active event
 * Usage: node scripts/set-active-event.js <eventId>
 * Example: node scripts/set-active-event.js skh-2026
 */

import { initFirebaseAdmin, getDb } from '../services/firebaseAdmin.js'

async function setActiveEvent(eventId) {
  initFirebaseAdmin()
  const db = getDb()
  
  if (!eventId) {
    console.error('❌ Error: Event ID is required')
    console.log('Usage: node scripts/set-active-event.js <eventId>')
    process.exit(1)
  }
  
  console.log(`🔍 Checking if event "${eventId}" exists...`)
  
  // Check if event exists
  const eventSnap = await db.doc(`events/${eventId}`).get()
  if (!eventSnap.exists) {
    console.error(`❌ Error: Event "${eventId}" does not exist`)
    console.log('\n📋 Available events:')
    const allEvents = await db.collection('events').get()
    allEvents.docs.forEach(doc => {
      const data = doc.data()
      console.log(`  - ${doc.id} (${data.name || 'Unnamed'})`)
    })
    process.exit(1)
  }
  
  console.log(`✅ Event "${eventId}" found`)
  console.log(`📝 Setting as active event...`)
  
  // Deactivate all events
  const allEvents = await db.collection('events').get()
  const batch = db.batch()
  
  let deactivatedCount = 0
  allEvents.docs.forEach(doc => {
    if (doc.data().active === true) {
      batch.update(doc.ref, { active: false })
      deactivatedCount++
      console.log(`   Deactivating: ${doc.id}`)
    }
  })
  
  // Activate the specified event
  const eventRef = db.doc(`events/${eventId}`)
  batch.update(eventRef, { 
    active: true, 
    updatedAt: new Date(),
    // Add default team size if not set
    minTeamSize: eventSnap.data().minTeamSize || 1,
    maxTeamSize: eventSnap.data().maxTeamSize || 4,
  })
  
  // ARCH-01: Write config/platform.activeEventId atomically — this is now the
  // authoritative source. Also keep events.active flag in sync for backward compat.
  await db.doc('config/platform').set(
    { activeEventId: eventId, updatedAt: new Date() },
    { merge: true },
  )

  await batch.commit()

  console.log(`\n✅ Success!`)
  console.log(`   Active event: ${eventId}`)
  console.log(`   config/platform.activeEventId updated`)
  console.log(`   Deactivated: ${deactivatedCount} other event(s)`)
  console.log(`   Team size: ${eventSnap.data().minTeamSize || 2}-${eventSnap.data().maxTeamSize || 4} members`)
  
  process.exit(0)
}

// Get event ID from command line argument
const eventId = process.argv[2]
setActiveEvent(eventId).catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
