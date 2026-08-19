import type { ChibiRigParts } from './ChibiAvatarMesh'

const THROW_DURATION_S = 0.42

export class ChibiAnimator {
  #walkPhase = 0
  #throwTimer = 0

  triggerThrow = (): void => {
    this.#throwTimer = THROW_DURATION_S
  }

  get isThrowing(): boolean {
    return this.#throwTimer > 0
  }

  update(
    rig: ChibiRigParts,
    state: 'sit' | 'stand',
    speed: number,
    dt: number,
    time: number,
    isGrounded = true,
    isSkiing = false,
    turnRate = 0,
  ): void {
    const { torsoPivot, headPivot, leftArmPivot, rightArmPivot, leftLegPivot, rightLegPivot } = rig

    // 1. Dynamic Face Canvas Texture (Blinking & Expression Animation)
    if (rig.faceTexture) {
      rig.faceTexture.update(dt)
    }

    // 2. Throw Action Timer
    if (this.#throwTimer > 0) {
      this.#throwTimer = Math.max(0, this.#throwTimer - dt)
    }

    // 3. Posture & Locomotion Animation
    if (state === 'sit') {
      // --- Natural Ground-Sitting Posture & Subtle Breathing ---
      const breath = Math.sin(time * 2.0) * 0.006
      torsoPivot.position.set(0, 0.08 + breath, 0)
      torsoPivot.rotation.set(0.04, 0, 0)

      headPivot.position.set(0, 0.34, 0)
      headPivot.rotation.set(
        -0.02 + Math.sin(time * 1.0) * 0.015,
        Math.sin(time * 0.8) * 0.04,
        Math.sin(time * 1.2) * 0.02,
      )

      // Arms resting on knees/lap
      leftArmPivot.rotation.set(0.45, 0.12, 0.22)
      rightArmPivot.rotation.set(0.45, -0.12, -0.22)

      // Legs extending forward naturally on the ground with slight outward splay
      leftLegPivot.rotation.set(-1.42, 0.2, -0.15)
      rightLegPivot.rotation.set(-1.42, -0.2, 0.15)
    } else if (isSkiing) {
      // --- Alpine Ski: Clean, stable upright standing posture on skiboard ---
      const bank = Math.max(-0.2, Math.min(0.2, -turnRate * 0.2))

      // Upright torso at standard standing height, zero bounce
      torsoPivot.position.set(0, 0.28, 0)
      torsoPivot.rotation.set(-0.04, 0, bank)

      headPivot.position.set(0, 0.34, 0)
      headPivot.rotation.set(0, 0, -bank * 0.25)

      // Natural standing arm balance
      leftArmPivot.rotation.set(0.15, 0.05, 0.12)
      rightArmPivot.rotation.set(0.15, -0.05, -0.12)

      // Legs stay 100% straight & locked to the skiboard at all times
      leftLegPivot.rotation.set(0, 0, 0)
      rightLegPivot.rotation.set(0, 0, 0)
    } else if (!isGrounded) {
      // --- Airborne Jumping Pose (Non-skiing) ---
      torsoPivot.position.set(0, 0.32, 0)
      torsoPivot.rotation.set(-0.12, 0, 0)

      headPivot.position.set(0, 0.34, 0)
      headPivot.rotation.set(0.1, 0, 0)

      // Arms spread upward/outward
      leftArmPivot.rotation.set(-0.85, 0, 0.45)
      rightArmPivot.rotation.set(-0.85, 0, -0.45)

      // Legs tucked slightly backward
      leftLegPivot.rotation.set(-0.55, 0.12, -0.15)
      rightLegPivot.rotation.set(-0.55, -0.12, 0.15)
    } else {
      // --- Standing / Walking / Running ---
      if (speed < 0.2) {
        // Idle breathing & soft sway
        const breath = Math.sin(time * 2.5) * 0.008
        const sway = Math.sin(time * 1.2) * 0.03

        torsoPivot.position.set(0, 0.28 + breath, 0)
        torsoPivot.rotation.set(-0.03, sway * 0.5, sway)

        headPivot.position.set(0, 0.34, 0)
        headPivot.rotation.set(0, -sway * 0.8, -sway * 0.4)

        leftArmPivot.rotation.set(Math.sin(time * 1.8) * 0.05, 0, 0.08)
        rightArmPivot.rotation.set(-Math.sin(time * 1.8) * 0.05, 0, -0.08)

        leftLegPivot.rotation.set(0, 0, 0)
        rightLegPivot.rotation.set(0, 0, 0)
      } else {
        // Locomotion (Walk / Run)
        const isRun = speed >= 2.5
        const strideSpeed = isRun ? 12 : 8
        this.#walkPhase += dt * speed * strideSpeed

        const swingAmp = isRun ? 0.95 : 0.65
        const armAmp = isRun ? 0.85 : 0.55
        const bounceAmp = isRun ? 0.035 : 0.02
        const lean = isRun ? -0.18 : -0.05

        const legRot = Math.sin(this.#walkPhase) * swingAmp
        const armRot = Math.sin(this.#walkPhase) * armAmp
        const bounce = Math.abs(Math.sin(this.#walkPhase)) * bounceAmp
        const roll = Math.sin(this.#walkPhase) * 0.05

        torsoPivot.position.set(0, 0.28 + bounce, 0)
        torsoPivot.rotation.set(lean, roll * 0.5, roll)

        headPivot.position.set(0, 0.34, 0)
        headPivot.rotation.set(-lean * 0.5, -roll, -roll * 0.5)

        // Opposite arm-leg swing
        leftLegPivot.rotation.set(legRot, 0, 0)
        rightLegPivot.rotation.set(-legRot, 0, 0)

        leftArmPivot.rotation.set(-armRot, 0, 0.1)
        rightArmPivot.rotation.set(armRot, 0, -0.1)
      }
    }

    // 4. Throw Motion Layer (Overrides Right Arm & Adds Torso Lean)
    if (this.#throwTimer > 0) {
      const progress = 1 - this.#throwTimer / THROW_DURATION_S // 0 -> 1
      if (progress < 0.32) {
        // Windup phase (pull back & raise arm)
        const t = progress / 0.32
        rightArmPivot.rotation.set(-1.6 * t, -0.35 * t, 0.25 * t)
        torsoPivot.rotation.y += 0.22 * t
      } else {
        // Power throw & follow-through
        const t = (progress - 0.32) / 0.68
        const whip = 1 - t
        rightArmPivot.rotation.set(1.5 * whip - 0.2 * t, 0.2 * whip, -0.15 * whip)
        torsoPivot.rotation.x += -0.14 * whip
        torsoPivot.rotation.y += -0.15 * whip
      }
    }

    // 5. Secondary Spring Physics (Hair, Ponytails, Scarf, Wings, Ears)
    if (rig.springBones && rig.springBones.length > 0) {
      // Inertia force derived from locomotion speed, stride bounce, and ambient wind
      const swayForce = Math.sin(this.#walkPhase) * (speed > 0.2 ? 0.25 : 0.05)
      const windBreeze = Math.sin(time * 2.8) * 0.08
      const inertia = {
        x: -speed * 0.18 + Math.abs(Math.sin(this.#walkPhase)) * 0.08,
        y: swayForce * 0.5 + windBreeze,
        z: swayForce,
      }
      for (const bone of rig.springBones) {
        bone.update(dt, inertia)
      }
    }
  }
}
