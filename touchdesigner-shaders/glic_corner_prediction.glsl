// GLIC Corner Prediction Shader for TouchDesigner
// Implements corner predictor (uses top-left corner value)

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
    
    // Get top-left corner pixel
    vec2 corner_uv = (block_pos + vec2(-1.0, -1.0)) / u_resolution;
    
    vec4 original = texture2D(tex0, uv);
    vec4 corner = safeTexture2D(tex0, corner_uv);
    
    // Corner prediction: use corner value for entire block
    vec4 predicted = vec4(corner.rgb, original.a);
    
    // Mix original with prediction
    gl_FragColor = mix(original, predicted, u_intensity);
}

