// GLIC Vertical Prediction Shader for TouchDesigner
// Implements vertical predictor (uses top pixel value)

uniform sampler2D tex0;
uniform vec2 u_resolution;
uniform float u_block_size;
uniform float u_intensity;
uniform float u_offset_x;
uniform float u_offset_y;

vec2 vTexCoord = gl_FragCoord.xy / u_resolution;

// Safe texture lookup
vec4 safeTexture2D(sampler2D tex, vec2 uv) {
    return texture2D(tex, clamp(uv, vec2(0.0), vec2(1.0)));
}

void main() {
    vec2 pixel = gl_FragCoord.xy;
    vec2 uv = vTexCoord;
    
    // Calculate block position
    vec2 block_pos = floor((pixel + vec2(u_offset_x, u_offset_y)) / u_block_size) * u_block_size;
    vec2 block_local = pixel - block_pos;
    
    // Get top pixel
    vec2 top_uv = (block_pos + vec2(block_local.x, -1.0)) / u_resolution;
    
    vec4 original = texture2D(tex0, uv);
    vec4 top = safeTexture2D(tex0, top_uv);
    
    // Vertical prediction: use top pixel value
    vec4 predicted = vec4(top.rgb, original.a);
    
    // Mix original with prediction
    gl_FragColor = mix(original, predicted, u_intensity);
}

