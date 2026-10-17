/** Cached glyphs + an instanced low-resolution wave field. No per-character simulation. */
const vertex = `#version 300 es
layout(location=0) in vec2 position;
out vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const waveVertex = `#version 300 es
layout(location=0) in vec2 position;
layout(location=1) in vec4 wave;
out vec2 uv;
flat out vec4 waveInfo;
void main(){uv=position*.5+.5;waveInfo=wave;gl_Position=vec4(position,0.,1.);}`;
const waveFragment = `#version 300 es
precision mediump float;
uniform vec2 viewport;
in vec2 uv;
flat in vec4 waveInfo;
out vec4 color;
void main(){
  float age=waveInfo.z;
  if(age<0. || age>3.2){color=vec4(0.);return;}
  float seed=waveInfo.w;
  vec2 at=vec2(uv.x,1.-uv.y)*viewport;
  vec2 delta=(at-waveInfo.xy*viewport)/min(viewport.x,viewport.y);
  delta=vec2(delta.x+(seed-.5)*delta.y*.45,delta.y*(.86+seed*.26));
  float distance=length(delta);
  vec2 direction=delta/max(distance,.001);
  float lobes=direction.x*(direction.x*direction.x-3.*direction.y*direction.y);
  float warped=distance*(1.+.14*lobes+.11*direction.x*direction.y+.09*(seed-.5)*direction.x);
  float ring=1.-smoothstep(.055,.19,abs(warped-age*.72));
  float fragments=.45+.55*smoothstep(-.75,.7,direction.y*(seed*2.-1.)+direction.x);
  float fade=smoothstep(0.,.13,age)*(1.-smoothstep(1.1,3.2,age));
  color=vec4(ring*fragments*fade,0.,0.,1.);
}`;
const fragment = `#version 300 es
precision mediump float;
uniform sampler2D glyphs;
uniform sampler2D sourceColors;
uniform sampler2D waveField;
uniform vec2 viewport;
uniform vec2 pointer;
uniform vec2 drift;
uniform float hover;
in vec2 uv;
out vec4 color;
void main(){
  vec2 sourceUV=vec2(uv.x,1.-uv.y);
  float inkAlpha=texture(glyphs,sourceUV).a;
  vec3 photographic=texture(sourceColors,sourceUV).rgb;
  vec2 at=sourceUV*viewport;
  float unit=min(viewport.x,viewport.y);
  vec2 d=(at-pointer)/clamp(unit*.24,75.,145.);
  float irregular=1.+.10*d.x*d.y+.07*drift.x*d.y+.05*drift.y*d.x;
  float spot=1.-smoothstep(.02,1.12,dot(d,d)*max(.65,irregular));
  float wave=texture(waveField,uv).r;
  float reveal=min(.94,max(.84*hover*spot,.94*wave));
  float luminance=dot(photographic,vec3(.2126,.7152,.0722));
  vec3 richer=clamp(vec3(luminance)+(photographic-vec3(luminance))*(1.+.25*wave)+.025*wave,0.,1.);
  vec3 ink=mix(vec3(.1412,.1804,.2392),richer,reveal);
  float alpha=clamp(inkAlpha*(1.+.10*wave),0.,1.);
  color=vec4(mix(vec3(.97255,.97255,.94902),ink,alpha),1.);
}`;
export interface GlyphGPU {
  upload(mask: HTMLImageElement, colors: HTMLImageElement): void;
  resize(width: number, height: number, quality?: number): void;
  paint(pointer: [number, number], hover: number, time: number, waves: Float32Array): void;
  destroy(): void;
}
export async function createGlyphGPU(canvas: HTMLCanvasElement): Promise<GlyphGPU | undefined> {
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'low-power'});
  if(!gl)return;
  const info=gl.getExtension('WEBGL_debug_renderer_info');
  if(info&&/swiftshader|llvmpipe|software/i.test(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))))return;
  const shaders:WebGLShader[]=[];
  function link(v:string,f:string){
    const program=gl!.createProgram()!;
    [gl!.VERTEX_SHADER,gl!.FRAGMENT_SHADER].forEach((kind,index)=>{
      const shader=gl!.createShader(kind)!;shaders.push(shader);gl!.shaderSource(shader,index?f:v);gl!.compileShader(shader);gl!.attachShader(program,shader);
    });gl!.linkProgram(program);return program;
  }
  const program=link(vertex,fragment),waveProgram=link(waveVertex,waveFragment),programs=[program,waveProgram];gl.flush();
  const parallel=gl.getExtension('KHR_parallel_shader_compile');
  if(parallel)await new Promise<void>(resolve=>{const poll=()=>{if(gl.isContextLost()||programs.every(p=>gl.getProgramParameter(p,parallel.COMPLETION_STATUS_KHR)))resolve();else setTimeout(poll,16);};poll();});
  else await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  if(gl.isContextLost()||programs.some(p=>!gl.getProgramParameter(p,gl.LINK_STATUS))){shaders.forEach(s=>gl.deleteShader(s));programs.forEach(p=>gl.deleteProgram(p));return;}
  const buffer=gl.createBuffer()!,instanceBuffer=gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  const textures=[0,1,2].map(unit=>{
    const texture=gl.createTexture()!;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);
    const filter=unit===1?gl.NEAREST:gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return texture;
  });
  const framebuffer=gl.createFramebuffer()!;
  gl.useProgram(program);['glyphs','sourceColors','waveField'].forEach((name,index)=>gl.uniform1i(gl.getUniformLocation(program,name),index));
  const uniforms=Object.fromEntries(['viewport','pointer','hover','drift'].map(name=>[name,gl.getUniformLocation(program,name)]));
  const waveViewport=gl.getUniformLocation(waveProgram,'viewport');
  let fieldWidth=0,fieldHeight=0;
  return {
    upload(mask,colors){[mask,colors].forEach((image,unit)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,textures[unit]!);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);});},
    resize(width,height,quality=1.5){
      const dpr=Math.min(devicePixelRatio||1,quality,Math.sqrt(2_500_000/(width*height)));
      const pixelWidth=Math.max(1,Math.round(width*dpr)),pixelHeight=Math.max(1,Math.round(height*dpr));
      if(canvas.width!==pixelWidth)canvas.width=pixelWidth;if(canvas.height!==pixelHeight)canvas.height=pixelHeight;
      const scale=Math.min(1,384/Math.max(width,height));
      const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
      if(fieldWidth!==w||fieldHeight!==h){fieldWidth=w;fieldHeight=h;gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,textures[2]!);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,textures[2]!,0);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
      gl.useProgram(waveProgram);gl.uniform2f(waveViewport,width,height);gl.useProgram(program);gl.uniform2f(uniforms.viewport!,width,height);
    },
    paint(pointer,hover,time,waves){
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(0,0,fieldWidth,fieldHeight);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      if(waves.length){
        gl.useProgram(waveProgram);gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,waves,gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,4,gl.FLOAT,false,0,0);gl.vertexAttribDivisor(1,1);
        gl.enable(gl.BLEND);gl.blendEquation(gl.MAX);gl.blendFunc(gl.ONE,gl.ONE);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,waves.length/4);gl.disable(gl.BLEND);gl.disableVertexAttribArray(1);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);
      gl.uniform2f(uniforms.pointer!,...pointer);gl.uniform1f(uniforms.hover!,hover);gl.uniform2f(uniforms.drift!,Math.sin(time*.00065),Math.cos(time*.00049));
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    },
    destroy(){textures.forEach(t=>gl.deleteTexture(t));gl.deleteFramebuffer(framebuffer);gl.deleteBuffer(buffer);gl.deleteBuffer(instanceBuffer);shaders.forEach(s=>gl.deleteShader(s));programs.forEach(p=>gl.deleteProgram(p));},
  };
}
