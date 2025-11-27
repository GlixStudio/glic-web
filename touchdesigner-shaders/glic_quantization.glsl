// GLIC Quantization Shader for TouchDesigner
// Implements quantization/posterization effect from GLIC codec

uniform sampler2D tex0;
uniform vec2 u_resolution;
uniform float u_quantization; // 0.0 = no quantization, 1.0 = maximum quantization
uniform float u_channel_quant[3]; // Per-channel quantization (optional, defaults to u_quantization)

vec2 vTexCoord = gl_FragCoord.xy / u_resolution;

void main() {
    vec4 color = texture2D(tex0, vTexCoord);
    
    // Use per-channel quantization if provided, otherwise use uniform
    vec3 quant_steps;
    if (u_channel_quant[0] > 0.0) {
        quant_steps = vec3(u_channel_quant[0], u_channel_quant[1], u_channel_quant[2]);
    } else {
        quant_steps = vec3(u_quantization);
    }
    
    // Clamp quantization to avoid division by zero
    quant_steps = clamp(quant_steps, 0.01, 1.0);
    
    // Quantization: divide by step, round, multiply back
    // Higher quantization value = more steps = less quantization
    // So we invert: more quantization = fewer steps
    vec3 quant_levels = vec3(1.0) / quant_steps;
    color.rgb = floor(color.rgb * quant_levels) / quant_levels;
    
    gl_FragColor = color;
}

