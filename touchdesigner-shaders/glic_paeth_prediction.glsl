// GLIC Paeth Prediction Shader for TouchDesigner
// Implements Paeth predictor algorithm creating blocky glitch effects

uniform sampler2D tex0;
uniform vec2 u_resolution;
uniform float u_block_size; // Block size in pixels
uniform float u_intensity; // 0.0 = original, 1.0 = full prediction
uniform float u_offset_x; // Block offset X (for animation)
uniform float u_offset_y; // Block offset Y (for animation)

vec2 vTexCoord = gl_FragCoord.xy / u_resolution;

// Paeth predictor function (from PNG specification)
float paeth(float a, float b, float c) {
    float p = a + b - c;
    float pa = abs(p - a);
    float pb = abs(p - b);
    float pc = abs(p - c);
    
    if (pa <= pb && pa <= pc) return b;
    else if (pb <= pc) return a;
    else return c;
}

// Safe texture lookup with clamping
vec4 safeTexture2D(sampler2D tex, vec2 uv) {
    return texture2D(tex, clamp(uv, vec2(0.0), vec2(1.0)));
}

void main() {
    vec2 pixel = gl_FragCoord.xy;
    vec2 uv = vTexCoord;
    
    // Calculate block position with offset
    vec2 block_pos = floor((pixel + vec2(u_offset_x, u_offset_y)) / u_block_size) * u_block_size;
    vec2 block_uv = block_pos / u_resolution;
    vec2 block_local = pixel - block_pos;
    
    // Get neighboring pixels (left, top, top-left)
    vec2 left_uv = (block_pos + vec2(-1.0, block_local.y)) / u_resolution;
    vec2 top_uv = (block_pos + vec2(block_local.x, -1.0)) / u_resolution;
    vec2 topleft_uv = (block_pos + vec2(-1.0, -1.0)) / u_resolution;
    
    vec4 original = texture2D(tex0, uv);
    vec4 left = safeTexture2D(tex0, left_uv);
    vec4 top = safeTexture2D(tex0, top_uv);
    vec4 topleft = safeTexture2D(tex0, topleft_uv);
    
    // Apply Paeth prediction per channel
    vec4 predicted;
    predicted.r = paeth(left.r, top.r, topleft.r);
    predicted.g = paeth(left.g, top.g, topleft.g);
    predicted.b = paeth(left.b, top.b, topleft.b);
    predicted.a = original.a;
    
    // Clamp predicted values
    predicted.rgb = clamp(predicted.rgb, 0.0, 1.0);
    
    // Mix original with prediction
    gl_FragColor = mix(original, predicted, u_intensity);
}

