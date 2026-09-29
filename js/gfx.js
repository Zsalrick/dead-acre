// ================= GRAPHICS QUALITY + POST-PROCESSING =================
// SET.gfx: 0 Alacsony (no shadows, no post, pixel ratio 1) · 1 Közepes (1024 shadows, half-res bloom, ratio 1)
//          2 Magas (2048 shadows, bloom, ratio up to 1.5).
// gfxRender(withViewmodel) replaces the plain world + viewmodel renders; if the post-processing scripts did not load
// it falls back to exactly those plain renders.
const GFX = { q: -1, composer: null, bloom: null, grade: null, vmPass: null };
const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform vec2 res; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(.299, .587, .114));
      c = mix(c, c * vec3(.9, .97, 1.1), (1.0 - smoothstep(0.0, .3, l)) * .5);   // cool moonlit shadows
      c = mix(vec3(l), c, 1.1);                                                  // a touch more colour
      vec2 d = vUv - .5; c *= clamp(1.0 - dot(d, d) * .9, 0.0, 1.0);             // vignette
      c += (hash(vUv * res + fract(time) * 91.0) - .5) * .025;                   // film grain
      gl_FragColor = vec4(c, 1.0);
    }`,
};
function gfxInit() {
  const T = THREE;
  if (!(T.EffectComposer && T.RenderPass && T.ShaderPass && T.UnrealBloomPass)) return;
  try {
    const s = renderer.getDrawingBufferSize(new T.Vector2());
    const rt = T.WebGLMultisampleRenderTarget
      ? Object.assign(new T.WebGLMultisampleRenderTarget(s.x, s.y, { format: T.RGBAFormat }), { samples: 4 })
      : new T.WebGLRenderTarget(s.x, s.y, { format: T.RGBAFormat, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
    const c = new T.EffectComposer(renderer, rt);
    c.addPass(new T.RenderPass(scene, camera));
    const vp = new T.RenderPass(vmScene, vmCamera); vp.clear = false; vp.clearDepth = true; c.addPass(vp);
    const bloom = null; // no bloom: the glow around lamps, labels and signs was more distracting than pretty
    c.addPass(new T.OutputPass()); // tone mapping and colour space happen here (r153+ only tone-maps on the way to the screen)
    const grade = new T.ShaderPass(GRADE_SHADER); c.addPass(grade);
    Object.assign(GFX, { composer: c, bloom, grade, vmPass: vp });
  } catch (e) { console.warn('Utófeldolgozás kikapcsolva:', e); GFX.composer = null; }
}
function gfxResize() {
  if (!GFX.composer) return;
  renderer.setSize(innerWidth, innerHeight); // this listener runs before the game's own resize handler
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  GFX.composer.setSize(s.x, s.y); GFX.grade.uniforms.res.value.copy(s);
}
function gfxApply() {
  const q = GFX.q = clamp(Math.round(SET.gfx == null ? 2 : SET.gfx), 0, 2);
  renderer.setPixelRatio(q === 2 ? Math.min(devicePixelRatio, 1.5) : 1);
  renderer.setSize(innerWidth, innerHeight);
  if (renderer.shadowMap.enabled !== q > 0) { // shadow on/off changes the shaders: rebuild the materials already in the scene
    renderer.shadowMap.enabled = q > 0;
    scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); });
  }
  const ms = q === 2 ? 2048 : 1024;
  if (moon.shadow.mapSize.x !== ms) { moon.shadow.mapSize.set(ms, ms); if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; } }
  gfxResize();
}
function gfxRender(withVM) {
  if (GFX.q !== (SET.gfx == null ? 2 : SET.gfx)) gfxApply(); // the settings screen changed it
  if (GFX.composer && GFX.q > 0) {
    GFX.vmPass.enabled = withVM;
    GFX.grade.uniforms.time.value = performance.now() / 1000;
    GFX.composer.render();
    return;
  }
  renderer.setRenderTarget(null);
  renderer.clear();
  renderer.render(scene, camera);
  if (withVM) { renderer.clearDepth(); renderer.render(vmScene, vmCamera); }
}
gfxInit();
gfxApply();
addEventListener('resize', gfxResize);
