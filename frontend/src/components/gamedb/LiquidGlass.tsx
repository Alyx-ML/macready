import { useRef, useEffect, useCallback, type ReactNode, type MouseEvent as RME } from "react";

interface Props {
  children: ReactNode;
  displacementScale?: number;
  blurAmount?: number;
  saturation?: number;
  aberrationIntensity?: number;
  elasticity?: number;
  cornerRadius?: number;
  padding?: string;
  onClick?: (e: RME<HTMLDivElement>) => void;
  className?: string;
}

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){v_uv=a_pos*0.5+0.5;gl_Position=vec4(a_pos,0.0,1.0);}
`;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform float u_t;
uniform vec2  u_m;
uniform float u_ab;

float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){
  vec2 i=floor(p),f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);
}

void main(){
  vec2 uv=v_uv;
  vec2 mouse=u_m*0.5+0.5;

  float md=length(uv-mouse);
  float mi=exp(-md*md*5.0);

  float noise=n(uv*3.0+u_t*0.2)*0.5+n(uv*7.0-u_t*0.13)*0.25+n(uv*14.0+u_t*0.33)*0.125;

  float ex=smoothstep(0.0,0.07,uv.x)*smoothstep(1.0,0.93,uv.x);
  float ey=smoothstep(0.0,0.07,uv.y)*smoothstep(1.0,0.93,uv.y);
  float edge=1.0-ex*ey;

  float s1=exp(-length(uv-vec2(0.22,0.15))*8.0);
  float s2=exp(-length(uv-vec2(0.78,0.82))*13.0)*0.35;
  float sm=exp(-length(uv-mouse)*9.0)*mi;

  float alpha=edge*0.10+s1*0.22+s2*0.12+sm*0.18+noise*0.013+edge*u_ab*0.035+mi*0.06;

  vec3 col=mix(vec3(0.82,0.91,1.0),vec3(1.0),s1*0.7+s2*0.3+sm*0.6);
  gl_FragColor=vec4(col,clamp(alpha,0.0,0.55));
}
`;

function mkShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src); gl.compileShader(s); return s;
}

export function LiquidGlass({
  children, aberrationIntensity = 1.2, elasticity = 0.22,
  cornerRadius = 16, padding = "0px", onClick, className = "",
}: Props) {
  const wrapRef  = useRef<HTMLDivElement>(null);
  const cvRef    = useRef<HTMLCanvasElement>(null);
  const rafRef   = useRef<number | null>(null);
  const t0Ref    = useRef(performance.now());
  const mouseRef = useRef({ x: 0, y: 0 });
  const targetRef= useRef({ x: 0, y: 0 });
  const velRef   = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: false }); if (!gl) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, mkShader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, mkShader(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const uT  = gl.getUniformLocation(prog, "u_t");
    const uM  = gl.getUniformLocation(prog, "u_m");
    const uAb = gl.getUniformLocation(prog, "u_ab");

    const resize = () => {
      const p = cv.parentElement; if (!p) return;
      cv.width = p.clientWidth; cv.height = p.clientHeight;
      gl.viewport(0, 0, cv.width, cv.height);
    };
    const ro = new ResizeObserver(resize); if (cv.parentElement) { ro.observe(cv.parentElement); resize(); }

    const render = () => {
      velRef.current.x += (targetRef.current.x - mouseRef.current.x) * elasticity;
      velRef.current.y += (targetRef.current.y - mouseRef.current.y) * elasticity;
      velRef.current.x *= 0.72; velRef.current.y *= 0.72;
      mouseRef.current.x += velRef.current.x; mouseRef.current.y += velRef.current.y;

      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uT,  (performance.now() - t0Ref.current) * 0.001);
      gl.uniform2f(uM,  mouseRef.current.x, mouseRef.current.y);
      gl.uniform1f(uAb, aberrationIntensity);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, [aberrationIntensity, elasticity]);

  const onMove = useCallback((e: RME<HTMLDivElement>) => {
    const r = wrapRef.current?.getBoundingClientRect(); if (!r) return;
    targetRef.current = {
      x:  ((e.clientX - r.left)  / r.width)  * 2 - 1,
      y: -(((e.clientY - r.top)  / r.height) * 2 - 1),
    };
  }, []);

  const onLeave = useCallback(() => { targetRef.current = { x: 0, y: 0 }; }, []);

  return (
    <div
      ref={wrapRef} onClick={onClick} onMouseMove={onMove} onMouseLeave={onLeave}
      className={`relative overflow-hidden w-full h-full ${className}`}
      style={{ padding, borderRadius: cornerRadius, cursor: onClick ? "pointer" : undefined }}
    >
      {children}
      <canvas
        ref={cvRef}
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          pointerEvents: "none", borderRadius: cornerRadius, mixBlendMode: "screen",
        }}
      />
    </div>
  );
}
