// GLIC YCbCr Color Space Conversion Shader for TouchDesigner
// Converts RGB to YCbCr and back, creating color shift effects

uniform sampler2D tex0;
uniform vec2 u_resolution;
uniform float u_colorspace_mix; // 0.0 = RGB, 1.0 = YCbCr conversion
uniform float u_channel_shift[3]; // Per-channel shift in YCbCr space

vec2 vTexCoord = gl_FragCoord.xy / u_resolution;

// RGB to YCbCr conversion (from GLIC colorspaces.pde)
vec3 rgb2ycbcr(vec3 rgb) {
    float y = 0.2988390 * rgb.r + 0.5868110 * rgb.g + 0.1143500 * rgb.b;
    float cb = -0.168736 * rgb.r - 0.3312640 * rgb.g + 0.5000000 * rgb.b;
    float cr = 0.5000000 * rgb.r - 0.4186880 * rgb.g - 0.0813120 * rgb.b;
    return vec3(y, cb + 0.5, cr + 0.5);
}

// YCbCr to RGB conversion
vec3 ycbcr2rgb(vec3 ycbcr) {
    float y = ycbcr.r;
    float cb = ycbcr.g - 0.5;
    float cr = ycbcr.b - 0.5;
    
    float r = y + 1.402 * cr;
    float g = y - 0.344136 * cb - 0.714136 * cr;
    float b = y + 1.772000 * cb;
    return clamp(vec3(r, g, b), 0.0, 1.0);
}

void main() {
    vec4 color = texture2D(tex0, vTexCoord);
    vec3 rgb = color.rgb;
    
    // Convert to YCbCr
    vec3 ycbcr = rgb2ycbcr(rgb);
    
    // Apply channel shifts if provided
    if (u_channel_shift[0] != 0.0 || u_channel_shift[1] != 0.0 || u_channel_shift[2] != 0.0) {
        ycbcr.r += u_channel_shift[0];
        ycbcr.g += u_channel_shift[1];
        ycbcr.b += u_channel_shift[2];
        ycbcr = clamp(ycbcr, 0.0, 1.0);
    }
    
    // Convert back to RGB
    vec3 back_rgb = ycbcr2rgb(ycbcr);
    
    // Mix between original and converted
    color.rgb = mix(rgb, back_rgb, u_colorspace_mix);
    
    gl_FragColor = color;
}

