import WebSocket from 'ws'

async function runTest() {
  console.log('[test] Connecting to LAN relay ws://localhost:3101...')

  const hostWs = new WebSocket('ws://localhost:3101')
  await new Promise<void>((res) => hostWs.on('open', res))

  hostWs.send(
    JSON.stringify({
      t: 'join',
      name: 'HostPlayer',
      avatarConfig: { hairStyle: 'bun' },
      sceneryId: 'aki-highlands',
    }),
  )

  const hostWelcome: any = await new Promise((res) => {
    hostWs.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.t === 'welcome') res(msg)
    })
  })

  console.log('[test] Host received welcome:', hostWelcome.sceneryId, 'sid:', hostWelcome.sid)

  const guestWs = new WebSocket('ws://localhost:3101')
  await new Promise<void>((res) => guestWs.on('open', res))

  guestWs.send(
    JSON.stringify({
      t: 'join',
      name: 'GuestPlayer',
      avatarConfig: { hairStyle: 'bob' },
    }),
  )

  const guestWelcome: any = await new Promise((res) => {
    guestWs.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.t === 'welcome') res(msg)
    })
  })

  console.log(
    '[test] Guest received welcome:',
    guestWelcome.sceneryId,
    'sid:',
    guestWelcome.sid,
    'roster:',
    guestWelcome.roster.length,
  )

  // Host sends position
  hostWs.send(
    JSON.stringify({
      t: 'input',
      x: 10,
      y: 5,
      z: 20,
      yaw: 1.5,
      anim: 'walk',
      flags: 1,
    }),
  )

  // Wait for guest to receive snapshot with host position
  const snapshot: any = await new Promise((res) => {
    guestWs.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.t === 'snapshot' && msg.avatars.length > 0) res(msg)
    })
  })

  console.log('[test] Guest received snapshot containing avatars:', snapshot.avatars)

  hostWs.close()
  guestWs.close()
  console.log('[test] LAN multiplayer test passed successfully!')
}

runTest().catch(console.error)
