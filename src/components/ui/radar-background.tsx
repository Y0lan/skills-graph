import { useRef, useEffect, useState } from 'react'

interface RadarProps {
  speed?: number
  scale?: number
  ringCount?: number
  spokeCount?: number
  color?: string
  backgroundColor?: string
  className?: string
}

export function RadarBackground({
  speed = 0.6,
  scale = 1.0,
  ringCount = 6,
  spokeCount = 8,
  color = 'rgba(34, 197, 94, 0.4)',
  backgroundColor = 'transparent',
  className = '',
}: RadarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Check for reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setFallback(true)
      return
    }

    let animId: number
    let disposed = false
    let cleanupFn: (() => void) | null = null

    import('ogl').then(({ Renderer, Program, Mesh, Triangle }) => {
      if (disposed) return

      const renderer = new Renderer({
        alpha: true,
        premultipliedAlpha: false,
        antialias: true,
      })
      const gl = renderer.gl
      container.appendChild(gl.canvas)
      gl.canvas.style.width = '100%'
      gl.canvas.style.height = '100%'
      gl.canvas.style.display = 'block'
      gl.clearColor(0, 0, 0, 0)

      const geometry = new Triangle(gl)

      const program = new Program(gl, {
        vertex: /* glsl */ `
          attribute vec2 uv;
          attribute vec3 position;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
          }
        `,
        fragment: /* glsl */ `
          precision highp float;
          uniform float uTime;
          uniform vec2 uResolution;
          uniform float uScale;
          uniform int uRingCount;
          uniform int uSpokeCount;
          uniform vec3 uColor;
          varying vec2 vUv;

          #define PI 3.14159265359
          #define TWO_PI 6.28318530718

          void main() {
            vec2 st = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
            st /= uScale;

            float dist = length(st);
            float angle = atan(st.y, st.x);

            // Rings
            float rings = 0.0;
            for (int i = 1; i <= 12; i++) {
              if (i > uRingCount) break;
              float r = float(i) / float(uRingCount);
              float ring = smoothstep(0.003, 0.0, abs(dist - r * 0.85));
              rings += ring * 0.4;
            }

            // Spokes
            float spokes = 0.0;
            for (int i = 0; i < 16; i++) {
              if (i >= uSpokeCount) break;
              float spokeAngle = float(i) * TWO_PI / float(uSpokeCount);
              float diff = abs(angle - spokeAngle);
              diff = min(diff, TWO_PI - diff);
              spokes += smoothstep(0.015, 0.0, diff) * 0.2 * step(dist, 0.85);
            }

            // Sweep beam
            float sweep = mod(uTime, TWO_PI);
            float angleDiff = mod(angle - sweep + TWO_PI, TWO_PI);
            float beam = smoothstep(0.8, 0.0, angleDiff) * 0.5;
            beam *= step(dist, 0.85);
            beam *= smoothstep(0.0, 0.15, dist);

            // Center dot
            float center = smoothstep(0.015, 0.005, dist);

            // Outer circle
            float outer = smoothstep(0.003, 0.0, abs(dist - 0.85)) * 0.6;

            float alpha = rings + spokes + beam + center * 0.6 + outer;
            alpha *= smoothstep(1.0, 0.7, dist);

            gl_FragColor = vec4(uColor * alpha, alpha);
          }
        `,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: [container.clientWidth, container.clientHeight] },
          uScale: { value: scale },
          uRingCount: { value: ringCount },
          uSpokeCount: { value: spokeCount },
          uColor: { value: parseColor(color) },
        },
        transparent: true,
        depthTest: false,
      })

      const mesh = new Mesh(gl, { geometry, program })

      function resize() {
        const w = container!.clientWidth
        const h = container!.clientHeight
        renderer.setSize(w, h)
        program.uniforms.uResolution.value = [w, h]
      }

      const observer = new ResizeObserver(resize)
      observer.observe(container)
      resize()

      function animate(t: number) {
        program.uniforms.uTime.value = (t / 1000) * speed
        renderer.render({ scene: mesh })
        animId = requestAnimationFrame(animate)
      }
      animId = requestAnimationFrame(animate)

      // Store cleanup in the disposed check
      const cleanup = () => {
        cancelAnimationFrame(animId)
        observer.disconnect()
        if (gl.canvas.parentNode) {
          gl.canvas.parentNode.removeChild(gl.canvas)
        }
        renderer.gl.getExtension('WEBGL_lose_context')?.loseContext()
      }
      cleanupFn = cleanup
    }).catch(() => {
      if (!disposed) setFallback(true)
    })

    return () => {
      disposed = true
      cancelAnimationFrame(animId)
      cleanupFn?.()
    }
  }, [speed, scale, ringCount, spokeCount, color])

  if (fallback) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          width: '100%',
          height: '100%',
          background: backgroundColor !== 'transparent'
            ? backgroundColor
            : 'radial-gradient(ellipse at center, rgba(34,197,94,0.08) 0%, transparent 70%)',
        }}
      />
    )
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        background: backgroundColor,
      }}
    />
  )
}

function parseColor(color: string): [number, number, number] {
  // Handle rgba/rgb
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (rgbaMatch) {
    return [
      parseInt(rgbaMatch[1]) / 255,
      parseInt(rgbaMatch[2]) / 255,
      parseInt(rgbaMatch[3]) / 255,
    ]
  }
  // Default green
  return [0.133, 0.773, 0.369]
}
