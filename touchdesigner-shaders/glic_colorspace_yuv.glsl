// GLIC YUV Color Space Conversion Shader for TouchDesigner
// Converts RGB to YUV and back, creating color shift effects

uniform sampler2D tex0;
uniform vec2 u_resolution;
uniform float u_colorspace_mix;
uniform float u_channel_shift[3];

vec2 vTexCoord = gl_FragCoord.xy / u_resolution;

// Constants from GLIC colorspaces.pde
const float Umax = 0.436;
const float Vmax = 0.615;

// RGB to YUV conversion
vec3 rgb2yuv(vec3 rgb) {
    float y = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    float u = (-0.14713 * rgb.r - 0.28886 * rgb.g + 0.436 * rgb.b) / Umax * 0.5 + 0.5;
    float v = (0.615 * rgb.r - 0.51499 * rgb.g - 0.10001 * rgb.b) / Vmax * 0.5 + 0.5;
    return vec3(y, u, v);
}

// YUV to RGB conversion
vec3 yuv2rgb(vec3 yuv) {
    float y = yuv.r;
    float u = (yuv.g - 0.5) * Umax * 2.0;
    float v = (yuv.b - 0.5) * Vmax * 2.0;
    
    float r = y + 1.13983 * v;
    float g = y - 0.39465 * u - 0.58060 * v;
    float b = y + 2.03211 * u;
    return clamp(vec3(r, g, b), 0.0, 1.0);
}

void main() {
    vec4 color = texture2D(tex0, vTexCoord);
    vec3 rgb = color.rgb;
    
    // Convert to YUV
    vec3 yuv = rgb2yuv(rgb);
    
    // Apply channel shifts if provided
    if (u_channel_shift[0] != 0.0 || u_channel_shift[1] != 0.0 || u_channel_shift[2] != 0.0) {
        yuv.r += u_channel_shift[0];
        yuv.g += u_channel_shift[1];
        yuv.b += u_channel_shift[2];
        yuv = clamp(yuv, 0.0, 1.0);
    }
    
    // Convert back to RGB
    vec3 back_rgb = yuv2rgb(yuv);
    
    // Mix between original and converted
    color.rgb = mix(rgb, back_rgb, u_colorspace_mix);
    
    gl_FragColor = color;
}

