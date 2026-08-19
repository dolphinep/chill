import * as THREE from 'three/webgpu'

export type VolleyballMatchState = 'idle' | 'serving' | 'in_rally' | 'game_over'

export class VolleyballCourt {
  readonly group = new THREE.Group()
  readonly id: string

  // Court geometry coordinates (relative to court center)
  readonly length = 14 // along X (-7 to +7)
  readonly width = 8 // along Z (-4 to +4)
  readonly netHeight = 1.85

  #courtX: number
  #courtY: number
  #courtZ: number
  #yaw: number

  // 3D Objects
  #sandBed: THREE.Mesh
  #netMesh: THREE.Mesh
  #ballMesh: THREE.Mesh
  #ballShadow: THREE.Mesh
  #scoreCanvas: HTMLCanvasElement
  #scoreTexture: THREE.CanvasTexture
  #scoreboardMesh: THREE.Mesh

  // Game & Physics State
  #matchState: VolleyballMatchState = 'idle'
  #scoreRed = 0
  #scoreBlue = 0
  #winner: 'red' | 'blue' | null = null
  #servingTeam: 'red' | 'blue' = 'red'

  // Joined Players
  #redPlayers = new Set<string>()
  #bluePlayers = new Set<string>()

  // Ball physics
  #ballX = 0
  #ballY = 1.2
  #ballZ = 0
  #ballVx = 0
  #ballVy = 0
  #ballVz = 0
  #ballActive = false
  #lastHitTime = 0
  #lastHitterSid = ''

  // Materials & Geometries
  #sandMat = new THREE.MeshStandardMaterial({ color: 0xecd5ab, roughness: 0.95 })
  #borderMat = new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 0.8 })
  #lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false })
  #postMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.6 })
  #netMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: 0.75,
  })
  #ballMat = new THREE.MeshStandardMaterial({ color: 0xffea00, roughness: 0.5 })
  #shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  })

  constructor(id: string, x: number, y: number, z: number, yaw: number) {
    this.id = id
    this.#courtX = x
    this.#courtY = y
    this.#courtZ = z
    this.#yaw = yaw

    this.group.position.set(x, y, z)
    this.group.rotation.y = yaw

    // 1. Leveled Sand Bed
    const sandGeo = new THREE.BoxGeometry(this.length, 0.16, this.width)
    this.#sandBed = new THREE.Mesh(sandGeo, this.#sandMat)
    this.#sandBed.position.set(0, 0.08, 0)
    this.#sandBed.receiveShadow = true
    this.group.add(this.#sandBed)

    // 2. Wooden Frame Borders
    const borderGeoX = new THREE.BoxGeometry(this.length + 0.3, 0.22, 0.16)
    const borderTop = new THREE.Mesh(borderGeoX, this.#borderMat)
    borderTop.position.set(0, 0.1, this.width / 2 + 0.08)
    this.group.add(borderTop)

    const borderBot = new THREE.Mesh(borderGeoX, this.#borderMat)
    borderBot.position.set(0, 0.1, -this.width / 2 - 0.08)
    this.group.add(borderBot)

    const borderGeoZ = new THREE.BoxGeometry(0.16, 0.22, this.width + 0.3)
    const borderLeft = new THREE.Mesh(borderGeoZ, this.#borderMat)
    borderLeft.position.set(-this.length / 2 - 0.08, 0.1, 0)
    this.group.add(borderLeft)

    const borderRight = new THREE.Mesh(borderGeoZ, this.#borderMat)
    borderRight.position.set(this.length / 2 + 0.08, 0.1, 0)
    this.group.add(borderRight)

    // 3. Boundary Lines
    const lineGeoX = new THREE.PlaneGeometry(this.length, 0.08)
    const lineTop = new THREE.Mesh(lineGeoX, this.#lineMat)
    lineTop.rotation.x = -Math.PI / 2
    lineTop.position.set(0, 0.165, this.width / 2 - 0.1)
    this.group.add(lineTop)

    const lineBot = new THREE.Mesh(lineGeoX, this.#lineMat)
    lineBot.rotation.x = -Math.PI / 2
    lineBot.position.set(0, 0.165, -this.width / 2 + 0.1)
    this.group.add(lineBot)

    const lineGeoZ = new THREE.PlaneGeometry(0.08, this.width)
    const lineLeft = new THREE.Mesh(lineGeoZ, this.#lineMat)
    lineLeft.rotation.x = -Math.PI / 2
    lineLeft.position.set(-this.length / 2 + 0.1, 0.165, 0)
    this.group.add(lineLeft)

    const lineRight = new THREE.Mesh(lineGeoZ, this.#lineMat)
    lineRight.rotation.x = -Math.PI / 2
    lineRight.position.set(this.length / 2 - 0.1, 0.165, 0)
    this.group.add(lineRight)

    // Center divider line
    const lineCenter = new THREE.Mesh(lineGeoZ, this.#lineMat)
    lineCenter.rotation.x = -Math.PI / 2
    lineCenter.position.set(0, 0.165, 0)
    this.group.add(lineCenter)

    // 4. Steel Net Posts
    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8)
    const postZ1 = new THREE.Mesh(postGeo, this.#postMat)
    postZ1.position.set(0, 1.2, this.width / 2 + 0.3)
    this.group.add(postZ1)

    const postZ2 = new THREE.Mesh(postGeo, this.#postMat)
    postZ2.position.set(0, 1.2, -this.width / 2 - 0.3)
    this.group.add(postZ2)

    // 5. Volleyball Net
    const netPlane = new THREE.PlaneGeometry(this.width + 0.6, 0.9, 20, 8)
    this.#netMesh = new THREE.Mesh(netPlane, this.#netMat)
    this.#netMesh.position.set(0, 1.4, 0)
    this.#netMesh.rotation.y = Math.PI / 2
    this.group.add(this.#netMesh)

    // Net top white band
    const netBandGeo = new THREE.BoxGeometry(0.04, 0.08, this.width + 0.6)
    const netBand = new THREE.Mesh(netBandGeo, this.#lineMat)
    netBand.position.set(0, 1.85, 0)
    this.group.add(netBand)

    // 6. Scoreboard Canvas
    this.#scoreCanvas = document.createElement('canvas')
    this.#scoreCanvas.width = 512
    this.#scoreCanvas.height = 128
    this.#scoreTexture = new THREE.CanvasTexture(this.#scoreCanvas)
    this.#updateScoreboardTexture()

    const scoreGeo = new THREE.PlaneGeometry(1.4, 0.38)
    const scoreMat = new THREE.MeshBasicMaterial({
      map: this.#scoreTexture,
      side: THREE.DoubleSide,
    })
    this.#scoreboardMesh = new THREE.Mesh(scoreGeo, scoreMat)
    this.#scoreboardMesh.position.set(0, 2.3, 0)
    this.#scoreboardMesh.rotation.y = Math.PI / 2
    this.group.add(this.#scoreboardMesh)

    // 7. Volleyball 3D Sphere & Ground Shadow
    const ballGeo = new THREE.SphereGeometry(0.22, 16, 16)
    this.#ballMesh = new THREE.Mesh(ballGeo, this.#ballMat)
    this.#ballMesh.position.set(0, -10, 0) // hidden initially
    this.#ballMesh.castShadow = true
    this.group.add(this.#ballMesh)

    const shadowGeo = new THREE.CircleGeometry(0.25, 16)
    this.#ballShadow = new THREE.Mesh(shadowGeo, this.#shadowMat)
    this.#ballShadow.rotation.x = -Math.PI / 2
    this.#ballShadow.position.set(0, 0.17, 0)
    this.#ballShadow.visible = false
    this.group.add(this.#ballShadow)
  }

  get matchState(): VolleyballMatchState {
    return this.#matchState
  }

  get scores(): { red: number; blue: number; winner: 'red' | 'blue' | null } {
    return { red: this.#scoreRed, blue: this.#scoreBlue, winner: this.#winner }
  }

  get ballPosition(): { x: number; y: number; z: number } {
    // Transform local ball position to world space
    const cosY = Math.cos(this.#yaw)
    const sinY = Math.sin(this.#yaw)
    const wx = this.#courtX + cosY * this.#ballX - sinY * this.#ballZ
    const wy = this.#courtY + this.#ballY
    const wz = this.#courtZ + sinY * this.#ballX + cosY * this.#ballZ
    return { x: wx, y: wy, z: wz }
  }

  joinTeam(sid: string, team: 'red' | 'blue'): void {
    if (team === 'red') {
      this.#bluePlayers.delete(sid)
      this.#redPlayers.add(sid)
    } else {
      this.#redPlayers.delete(sid)
      this.#bluePlayers.add(sid)
    }
  }

  leaveCourt(sid: string): void {
    this.#redPlayers.delete(sid)
    this.#bluePlayers.delete(sid)
    // Stop match immediately when a player leaves
    if (this.#matchState !== 'idle') {
      this.resetMatch()
    }
  }

  getPlayerTeam(sid: string): 'red' | 'blue' | null {
    if (this.#redPlayers.has(sid)) return 'red'
    if (this.#bluePlayers.has(sid)) return 'blue'
    return null
  }

  startMatch(): void {
    this.#scoreRed = 0
    this.#scoreBlue = 0
    this.#winner = null
    this.#servingTeam = 'red'
    this.#spawnServeBall('red')
    this.#updateScoreboardTexture()
  }

  resetMatch(): void {
    this.#matchState = 'idle'
    this.#scoreRed = 0
    this.#scoreBlue = 0
    this.#winner = null
    this.#ballActive = false
    this.#ballMesh.position.set(0, -10, 0)
    this.#ballShadow.visible = false
    this.#updateScoreboardTexture()
  }

  #spawnServeBall(team: 'red' | 'blue'): void {
    this.#ballX = team === 'red' ? -4.5 : 4.5
    this.#ballY = 1.6
    this.#ballZ = 0
    // Serve ball arcs cleanly over the net to the opponent
    this.#ballVx = team === 'red' ? 3.6 : -3.6
    this.#ballVy = 5.2
    this.#ballVz = (Math.random() - 0.5) * 1.2
    this.#ballActive = true
    this.#matchState = 'in_rally'
    this.#ballMesh.position.set(this.#ballX, this.#ballY, this.#ballZ)
    this.#ballShadow.position.set(this.#ballX, 0.17, this.#ballZ)
    this.#ballShadow.visible = true
  }

  hitBall(
    worldHitterX: number,
    worldHitterY: number,
    worldHitterZ: number,
    hitterSid: string,
    spike = false,
  ): { hit: boolean; vx: number; vy: number; vz: number } | null {
    if (!this.#ballActive || this.#matchState === 'game_over') return null

    // Convert world player position to local court space
    const cosY = Math.cos(-this.#yaw)
    const sinY = Math.sin(-this.#yaw)
    const dx = worldHitterX - this.#courtX
    const dz = worldHitterZ - this.#courtZ
    const localPx = cosY * dx - sinY * dz
    const localPz = sinY * dx + cosY * dz

    // Accurate 3D distance check: player chest/arm level (~0.85m above character origin) vs ball height
    const worldBallY = this.#courtY + this.#ballY
    const horizontalDist = Math.hypot(localPx - this.#ballX, localPz - this.#ballZ)
    const verticalDist = Math.abs(worldHitterY + 0.85 - worldBallY)
    const dist3D = Math.hypot(horizontalDist, verticalDist)

    // Accurate arm reach: <= 0.95m horizontal, <= 1.05m vertical
    if (horizontalDist > 0.95 || verticalDist > 1.05 || dist3D > 1.15) {
      return null
    }

    const now = performance.now()
    if (now - this.#lastHitTime < 180) return null // debounce
    this.#lastHitTime = now
    this.#lastHitterSid = hitterSid

    // Determine target side: If hit on Red side (x < 0), send to Blue side (x > 0)
    const toOpponentX = this.#ballX < 0 ? 1 : -1
    const targetX = toOpponentX * (2.2 + Math.random() * 3.5)
    const targetZ = (Math.random() - 0.5) * (this.width - 2.0)

    const flightTime = spike ? 0.7 : 1.1
    this.#ballVx = (targetX - this.#ballX) / flightTime
    this.#ballVy = spike ? 3.4 : 5.6
    this.#ballVz = (targetZ - this.#ballZ) / flightTime

    this.#matchState = 'in_rally'
    return { hit: true, vx: this.#ballVx, vy: this.#ballVy, vz: this.#ballVz }
  }

  applyRemoteHit(ball: {
    x: number
    y: number
    z: number
    vx: number
    vy: number
    vz: number
  }): void {
    this.#ballX = ball.x
    this.#ballY = ball.y
    this.#ballZ = ball.z
    this.#ballVx = ball.vx
    this.#ballVy = ball.vy
    this.#ballVz = ball.vz
    this.#ballActive = true
    this.#matchState = 'in_rally'
  }

  applyRemoteScore(scoreRed: number, scoreBlue: number, winner?: 'red' | 'blue'): void {
    this.#scoreRed = scoreRed
    this.#scoreBlue = scoreBlue
    this.#winner = winner ?? null
    if (winner) {
      this.#matchState = 'game_over'
    } else {
      this.#servingTeam = scoreRed > scoreBlue ? 'blue' : 'red'
      this.#spawnServeBall(this.#servingTeam)
    }
    this.#updateScoreboardTexture()
  }

  /** Checks and clamps player inside their designated court half */
  clampPlayerInsideCourt(
    worldX: number,
    worldZ: number,
    team: 'red' | 'blue',
  ): { x: number; z: number; clamped: boolean } {
    if (this.#matchState === 'idle' || this.#matchState === 'game_over') {
      return { x: worldX, z: worldZ, clamped: false }
    }

    // Convert to court local space
    const cosY = Math.cos(-this.#yaw)
    const sinY = Math.sin(-this.#yaw)
    const dx = worldX - this.#courtX
    const dz = worldZ - this.#courtZ
    let localX = cosY * dx - sinY * dz
    let localZ = sinY * dx + cosY * dz
    let clamped = false

    const minX = team === 'red' ? -this.length / 2 + 0.3 : 0.2
    const maxX = team === 'red' ? -0.2 : this.length / 2 - 0.3
    const minZ = -this.width / 2 + 0.3
    const maxZ = this.width / 2 - 0.3

    if (localX < minX) {
      localX = minX
      clamped = true
    } else if (localX > maxX) {
      localX = maxX
      clamped = true
    }

    if (localZ < minZ) {
      localZ = minZ
      clamped = true
    } else if (localZ > maxZ) {
      localZ = maxZ
      clamped = true
    }

    if (!clamped) return { x: worldX, z: worldZ, clamped: false }

    // Convert back to world space
    const cosYaw = Math.cos(this.#yaw)
    const sinYaw = Math.sin(this.#yaw)
    const cx = this.#courtX + cosYaw * localX - sinYaw * localZ
    const cz = this.#courtZ + sinYaw * localX + cosYaw * localZ
    return { x: cx, z: cz, clamped: true }
  }

  update(
    dt: number,
    onScorePoint?: (
      scoringTeam: 'red' | 'blue',
      scoreRed: number,
      scoreBlue: number,
      winner?: 'red' | 'blue',
    ) => void,
  ): void {
    if (!this.#ballActive) return

    if (this.#matchState === 'in_rally' || this.#matchState === 'serving') {
      this.#ballVy -= 9.8 * dt
      this.#ballX += this.#ballVx * dt
      this.#ballY += this.#ballVy * dt
      this.#ballZ += this.#ballVz * dt

      // Net collision bounce: net is at x = 0, y <= 1.85
      if (Math.abs(this.#ballX) < 0.18 && this.#ballY <= this.netHeight) {
        this.#ballVx = -this.#ballVx * 0.6
        this.#ballVy = Math.max(this.#ballVy, 1.5)
      }

      // Court boundary ball bounce / landing on sand (y <= 0.24m)
      if (this.#ballY <= 0.24) {
        this.#ballY = 0.24

        // Ball landed on ground during rally -> Point scored!
        if (this.#matchState === 'in_rally') {
          let scoringTeam: 'red' | 'blue'
          // If landed on Red side (x < 0), Blue gets point; if landed on Blue side (x > 0), Red gets point
          if (this.#ballX < 0) {
            this.#scoreBlue++
            scoringTeam = 'blue'
          } else {
            this.#scoreRed++
            scoringTeam = 'red'
          }

          let winner: 'red' | 'blue' | undefined
          if (this.#scoreRed >= 5) {
            winner = 'red'
            this.#winner = 'red'
            this.#matchState = 'game_over'
          } else if (this.#scoreBlue >= 5) {
            winner = 'blue'
            this.#winner = 'blue'
            this.#matchState = 'game_over'
          } else {
            this.#servingTeam = scoringTeam
            this.#spawnServeBall(this.#servingTeam)
          }

          this.#updateScoreboardTexture()
          onScorePoint?.(scoringTeam, this.#scoreRed, this.#scoreBlue, winner)
        } else {
          // Serve ball gently bouncing before hit
          this.#ballVy = Math.abs(this.#ballVy) * 0.65
        }
      }

      this.#ballMesh.position.set(this.#ballX, this.#ballY, this.#ballZ)
      this.#ballShadow.position.set(this.#ballX, 0.17, this.#ballZ)
      const shadowScale = Math.max(0.4, 1.0 - (this.#ballY - 0.24) * 0.15)
      this.#ballShadow.scale.set(shadowScale, shadowScale, shadowScale)
    }
  }

  #updateScoreboardTexture(): void {
    const ctx = this.#scoreCanvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, 512, 128)

    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 6
    ctx.strokeRect(4, 4, 504, 120)

    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (this.#winner) {
      ctx.fillStyle = this.#winner === 'red' ? '#ef4444' : '#3b82f6'
      ctx.fillText(`🏆 TEAM ${this.#winner.toUpperCase()} WINS SET! 🏆`, 256, 64)
    } else {
      // Red Score
      ctx.fillStyle = '#ef4444'
      ctx.fillText(`RED  ${this.#scoreRed}`, 120, 64)

      // Center Divider
      ctx.fillStyle = '#94a3b8'
      ctx.fillText(`vs`, 256, 64)

      // Blue Score
      ctx.fillStyle = '#3b82f6'
      ctx.fillText(`${this.#scoreBlue}  BLUE`, 392, 64)
    }

    this.#scoreTexture.needsUpdate = true
  }

  dispose(): void {
    this.group.remove(this.#sandBed)
    this.group.remove(this.#netMesh)
    this.group.remove(this.#ballMesh)
    this.group.remove(this.#ballShadow)
    this.group.remove(this.#scoreboardMesh)
  }
}
