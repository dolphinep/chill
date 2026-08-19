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
    const bones = rig.humanoidBones

    if (state === 'sit') {
      // --- Natural Sitting Posture (Bench / Chair / Ground) & Gentle Breathing ---
      const breath = Math.sin(time * 2.0) * 0.005
      torsoPivot.position.set(0, 0.22 + breath, 0)
      torsoPivot.rotation.set(0.02, 0, 0)

      headPivot.position.set(0, 0.34, 0)
      headPivot.rotation.set(
        -0.02 + Math.sin(time * 1.0) * 0.012,
        Math.sin(time * 0.8) * 0.03,
        Math.sin(time * 1.2) * 0.015,
      )

      // Procedural limbs
      leftArmPivot.rotation.set(0.42, 0.10, 0.18)
      rightArmPivot.rotation.set(0.42, -0.10, -0.18)
      leftLegPivot.rotation.set(-1.42, 0.10, 0)
      rightLegPivot.rotation.set(-1.42, -0.10, 0)

      // Humanoid 3D Skeletal Sitting Posture
      if (bones) {
        // Thighs extend forward horizontally
        if (bones.leftUpperLeg) bones.leftUpperLeg.rotation.set(-1.45, 0.08, -0.04)
        if (bones.rightUpperLeg) bones.rightUpperLeg.rotation.set(-1.45, -0.08, 0.04)
        // Knees bend down 90 degrees naturally hanging over the bench edge
        if (bones.leftLowerLeg) bones.leftLowerLeg.rotation.set(1.45, 0, 0)
        if (bones.rightLowerLeg) bones.rightLowerLeg.rotation.set(1.45, 0, 0)
        // Arms & hands resting neatly on thighs/lap
        if (bones.leftUpperArm) bones.leftUpperArm.rotation.set(0.35, 0.05, 0.95)
        if (bones.rightUpperArm) bones.rightUpperArm.rotation.set(0.35, -0.05, -0.95)
        if (bones.leftLowerArm) bones.leftLowerArm.rotation.set(0.45, 0, 0)
        if (bones.rightLowerArm) bones.rightLowerArm.rotation.set(0.45, 0, 0)
      }
    } else if (isSkiing) {
      // --- Alpine Ski: Clean, stable upright standing posture on skiboard ---
      const bank = Math.max(-0.2, Math.min(0.2, -turnRate * 0.2))

      torsoPivot.position.set(0, 0.28, 0)
      torsoPivot.rotation.set(-0.04, 0, bank)

      headPivot.position.set(0, 0.34, 0)
      headPivot.rotation.set(0, 0, -bank * 0.25)

      leftArmPivot.rotation.set(0.15, 0.05, 0.12)
      rightArmPivot.rotation.set(0.15, -0.05, -0.12)
      leftLegPivot.rotation.set(0, 0, 0)
      rightLegPivot.rotation.set(0, 0, 0)

      if (bones) {
        if (bones.leftUpperLeg) bones.leftUpperLeg.rotation.set(0, 0, 0)
        if (bones.rightUpperLeg) bones.rightUpperLeg.rotation.set(0, 0, 0)
        if (bones.leftLowerLeg) bones.leftLowerLeg.rotation.set(0, 0, 0)
        if (bones.rightLowerLeg) bones.rightLowerLeg.rotation.set(0, 0, 0)
        if (bones.leftUpperArm) bones.leftUpperArm.rotation.set(0.2, 0, 1.0)
        if (bones.rightUpperArm) bones.rightUpperArm.rotation.set(0.2, 0, -1.0)
        if (bones.leftLowerArm) bones.leftLowerArm.rotation.set(0.2, 0, 0)
        if (bones.rightLowerArm) bones.rightLowerArm.rotation.set(0.2, 0, 0)
      }
    } else if (!isGrounded) {
      // --- Airborne Jumping Pose ---
      torsoPivot.position.set(0, 0.32, 0)
      torsoPivot.rotation.set(-0.12, 0, 0)

      headPivot.position.set(0, 0.34, 0)
      headPivot.rotation.set(0.1, 0, 0)

      leftArmPivot.rotation.set(-0.85, 0, 0.45)
      rightArmPivot.rotation.set(-0.85, 0, -0.45)
      leftLegPivot.rotation.set(-0.55, 0.12, -0.15)
      rightLegPivot.rotation.set(-0.55, -0.12, 0.15)

      if (bones) {
        if (bones.leftUpperLeg) bones.leftUpperLeg.rotation.set(-0.45, 0.1, -0.1)
        if (bones.rightUpperLeg) bones.rightUpperLeg.rotation.set(-0.45, -0.1, 0.1)
        if (bones.leftLowerLeg) bones.leftLowerLeg.rotation.set(0.6, 0, 0)
        if (bones.rightLowerLeg) bones.rightLowerLeg.rotation.set(0.6, 0, 0)
        if (bones.leftUpperArm) bones.leftUpperArm.rotation.set(-0.6, 0, 0.7)
        if (bones.rightUpperArm) bones.rightUpperArm.rotation.set(-0.6, 0, -0.7)
      }
    } else {
      // --- Standing / Walking / Running ---
      if (speed < 0.2) {
        // Idle breathing & subtle posture sway
        const breath = Math.sin(time * 2.2) * 0.005
        const sway = Math.sin(time * 1.1) * 0.015

        torsoPivot.position.set(0, 0.28 + breath, 0)
        torsoPivot.rotation.set(-0.02, sway * 0.3, sway * 0.5)

        headPivot.position.set(0, 0.34, 0)
        headPivot.rotation.set(0, -sway * 0.4, -sway * 0.2)

        leftArmPivot.rotation.set(Math.sin(time * 1.6) * 0.03, 0, 0.08)
        rightArmPivot.rotation.set(-Math.sin(time * 1.6) * 0.03, 0, -0.08)

        leftLegPivot.rotation.set(0, 0, 0)
        rightLegPivot.rotation.set(0, 0, 0)

        // Humanoid Bones Idle Rest
        if (bones) {
          if (bones.leftUpperLeg) bones.leftUpperLeg.rotation.set(0, 0, 0)
          if (bones.rightUpperLeg) bones.rightUpperLeg.rotation.set(0, 0, 0)
          if (bones.leftLowerLeg) bones.leftLowerLeg.rotation.set(0, 0, 0)
          if (bones.rightLowerLeg) bones.rightLowerLeg.rotation.set(0, 0, 0)
          if (bones.leftUpperArm) bones.leftUpperArm.rotation.set(Math.sin(time * 1.8) * 0.02, 0, 1.25)
          if (bones.rightUpperArm) bones.rightUpperArm.rotation.set(-Math.sin(time * 1.8) * 0.02, 0, -1.25)
          if (bones.leftLowerArm) bones.leftLowerArm.rotation.set(0, 0, 0)
          if (bones.rightLowerArm) bones.rightLowerArm.rotation.set(0, 0, 0)
        }
      } else {
        // Natural Human Locomotion (Walk / Run)
        const isRun = speed >= 4.5
        // Realistic human cadence: ~1.8 to 2.4 steps/second
        const strideCadence = isRun ? 4.2 : 3.4
        this.#walkPhase += dt * Math.min(speed, 6.0) * strideCadence

        const legAmp = isRun ? 0.75 : 0.52
        const armAmp = isRun ? 0.65 : 0.42
        const kneeAmp = isRun ? 0.85 : 0.55
        const bounceAmp = isRun ? 0.018 : 0.010
        const lean = isRun ? -0.10 : -0.03

        const legRot = Math.sin(this.#walkPhase) * legAmp
        const armRot = Math.sin(this.#walkPhase) * armAmp
        // Double-frequency vertical pelvis bobbing per stride
        const bounce = Math.abs(Math.sin(this.#walkPhase)) * bounceAmp
        // Subtle natural pelvis rotation (no duck waddle)
        const roll = Math.sin(this.#walkPhase) * 0.015

        torsoPivot.position.set(0, 0.28 + bounce, 0)
        torsoPivot.rotation.set(lean, roll * 0.4, roll)

        headPivot.position.set(0, 0.34, 0)
        headPivot.rotation.set(-lean * 0.4, -roll * 0.5, 0)

        // Procedural Rig Limbs
        leftLegPivot.rotation.set(legRot, 0, 0)
        rightLegPivot.rotation.set(-legRot, 0, 0)
        leftArmPivot.rotation.set(-armRot, 0, 0.08)
        rightArmPivot.rotation.set(armRot, 0, -0.08)

        // Humanoid 3D Skeletal Animation (VRM, Chibi Girl, Padoru)
        if (bones) {
          // Legs swing opposite to each other with natural knee bending on back swing
          if (bones.leftUpperLeg) bones.leftUpperLeg.rotation.set(legRot, 0, 0)
          if (bones.rightUpperLeg) bones.rightUpperLeg.rotation.set(-legRot, 0, 0)
          if (bones.leftLowerLeg) {
            bones.leftLowerLeg.rotation.set(Math.max(0, -Math.sin(this.#walkPhase) * kneeAmp), 0, 0)
          }
          if (bones.rightLowerLeg) {
            bones.rightLowerLeg.rotation.set(Math.max(0, Math.sin(this.#walkPhase) * kneeAmp), 0, 0)
          }

          // Arms swing forward and backward naturally on X axis
          if (bones.leftUpperArm) {
            bones.leftUpperArm.rotation.set(-armRot, 0, 1.25)
          }
          if (bones.rightUpperArm) {
            bones.rightUpperArm.rotation.set(armRot, 0, -1.25)
          }
          if (bones.leftLowerArm) {
            bones.leftLowerArm.rotation.set(Math.max(0, -armRot * 0.35), 0, 0)
          }
          if (bones.rightLowerArm) {
            bones.rightLowerArm.rotation.set(Math.max(0, armRot * 0.35), 0, 0)
          }
        }
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

    // 5. Secondary Spring Physics (Hair, Ponytails, Scarf, Wings, Skirt, Ears)
    if (rig.springBones && rig.springBones.length > 0) {
      // Fluid dynamic hair sway derived from locomotion velocity, stride bounce, centrifugal turning, and wind
      const isMoving = speed > 0.2
      const walkFactor = isMoving ? Math.min(speed / 3.5, 1.6) : 0.15
      const swayForce = Math.sin(this.#walkPhase) * 0.20 * walkFactor
      const stepBounce = Math.cos(this.#walkPhase * 2.0) * 0.12 * walkFactor
      const centrifugalSway = -turnRate * 0.18
      const windBreeze = Math.sin(time * 2.6) * 0.05
      const forwardDrag = isMoving ? -0.16 * walkFactor : 0

      const inertia = {
        x: forwardDrag + stepBounce,
        y: swayForce * 0.35 + windBreeze,
        z: swayForce + centrifugalSway,
      }
      for (const bone of rig.springBones) {
        bone.update(dt, inertia)
      }
    }
  }
}
