// GLIC Combined Shader for TouchDesigner
// Combines multiple GLIC effects into one shader

uniform sampler2D tex0;
uniform vec2 u_resolution;
uniform float u_time;

// Quantization
uniform float u_quantization;
uniform int u_enable_quantization; // 0 or 1

// Prediction
uniform float u_block_size;
uniform float u_prediction_intensity;
uniform int u_prediction_type; // 0=none, 1=paeth, 2=median, 3=truemotion
uniform float u_offset_x;
uniform float u_offset_y;

// Color Space
uniform float u_colorspace_mix;
uniform int u_colorspace_type; // 0=none, 1=YCbCr, 2=YUV
uniform float u_channel_shift[3];

// Segmentation
uniform float u_segmentation_threshold;
uniform float u_segmentation_intensity;
uniform int u_enable_segmentation; // 0 or 1

vec2 vTexCoord = gl_FragCoord.xy / u_resolution;

// Paeth predictor
float paeth(float a, float b, float c) {
    float p = a + b - c;
    float pa = abs(p - a);
    float pb = abs(p - b);
    float pc = abs(p - c);
    if (pa <= pb && pa <= pc) return b;
    else if (pb <= pc) return a;
    else return c;
}

// Median
float median(float a, float b, float c) {
    return max(min(a, b), min(max(a, b), c));
}

// Safe texture lookup
vec4 safeTexture2D(sampler2D tex, vec2 uv) {
    return texture2D(tex, clamp(uv, vec2(0.0), vec2(1.0)));
}

// RGB to YCbCr
vec3 rgb2ycbcr(vec3 rgb) {
    float y = 0.2988390 * rgb.r + 0.5868110 * rgb.g + 0.1143500 * rgb.b;
    float cb = -0.168736 * rgb.r - 0.3312640 * rgb.g + 0.5000000 * rgb.b;
    float cr = 0.5000000 * rgb.r - 0.4186880 * rgb.g - 0.0813120 * rgb.b;
    return vec3(y, cb + 0.5, cr + 0.5);
}

// YCbCr to RGB
vec3 ycbcr2rgb(vec3 ycbcr) {
    float y = ycbcr.r;
    float cb = ycbcr.g - 0.5;
    float cr = ycbcr.b - 0.5;
    float r = y + 1.402 * cr;
    float g = y - 0.344136 * cb - 0.714136 * cr;
    float b = y + 1.772000 * cb;
    return clamp(vec3(r, g, b), 0.0, 1.0);
}

// RGB to YUV
const float Umax = 0.436;
const float Vmax = 0.615;

vec3 rgb2yuv(vec3 rgb) {
    float y = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    float u = (-0.14713 * rgb.r - 0.28886 * rgb.g + 0.436 * rgb.b) / Umax * 0.5 + 0.5;
    float v = (0.615 * rgb.r - 0.51499 * rgb.g - 0.10001 * rgb.b) / Vmax * 0.5 + 0.5;
    return vec3(y, u, v);
}

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
    vec2 pixel = gl_FragCoord.xy;
    vec4 color = texture2D(tex0, vTexCoord);
    
    // Apply quantization
    if (u_enable_quantization == 1 && u_quantization > 0.01) {
        float quant_step = clamp(u_quantization, 0.01, 1.0);
        float quant_levels = 1.0 / quant_step;
        color.rgb = floor(color.rgb * quant_levels) / quant_levels;
    }
    
    // Apply color space conversion
    if (u_colorspace_type > 0 && u_colorspace_mix > 0.0) {
        vec3 rgb = color.rgb;
        vec3 converted;
        
        if (u_colorspace_type == 1) {
            // YCbCr
            vec3 ycbcr = rgb2ycbcr(rgb);
            ycbcr.r += u_channel_shift[0];
            ycbcr.g += u_channel_shift[1];
            ycbcr.b += u_channel_shift[2];
            ycbcr = clamp(ycbcr, 0.0, 1.0);
            converted = ycbcr2rgb(ycbcr);
        } else if (u_colorspace_type == 2) {
            // YUV
            vec3 yuv = rgb2yuv(rgb);
            yuv.r += u_channel_shift[0];
            yuv.g += u_channel_shift[1];
            yuv.b += u_channel_shift[2];
            yuv = clamp(yuv, 0.0, 1.0);
            converted = yuv2rgb(yuv);
        }
        
        color.rgb = mix(rgb, converted, u_colorspace_mix);
    }
    
    // Apply prediction
    if (u_prediction_type > 0 && u_prediction_intensity > 0.0) {
        vec2 block_pos = floor((pixel + vec2(u_offset_x, u_offset_y)) / u_block_size) * u_block_size;
        vec2 block_local = pixel - block_pos;
        
        vec2 left_uv = (block_pos + vec2(-1.0, block_local.y)) / u_resolution;
        vec2 top_uv = (block_pos + vec2(block_local.x, -1.0)) / u_resolution;
        vec2 topleft_uv = (block_pos + vec2(-1.0, -1.0)) / u_resolution;
        
        vec4 left = safeTexture2D(tex0, left_uv);
        vec4 top = safeTexture2D(tex0, top_uv);
        vec4 topleft = safeTexture2D(tex0, topleft_uv);
        vec4 corner = topleft;
        
        vec4 predicted = color;
        
        if (u_prediction_type == 1) {
            // Paeth
            predicted.r = paeth(left.r, top.r, topleft.r);
            predicted.g = paeth(left.g, top.g, topleft.g);
            predicted.b = paeth(left.b, top.b, topleft.b);
        } else if (u_prediction_type == 2) {
            // Median
            predicted.r = median(corner.r, left.r, top.r);
            predicted.g = median(corner.g, left.g, top.g);
            predicted.b = median(corner.b, left.b, top.b);
        } else if (u_prediction_type == 3) {
            // True motion
            predicted.rgb = clamp(left.rgb + top.rgb - corner.rgb, 0.0, 1.0);
        }
        
        predicted.a = color.a;
        color = mix(color, predicted, u_prediction_intensity);
    }
    
    // Apply segmentation (simplified - uses block average)
    if (u_enable_segmentation == 1 && u_segmentation_intensity > 0.0) {
        vec2 block_pos = floor(pixel / u_block_size) * u_block_size;
        vec2 block_center = block_pos + u_block_size * 0.5;
        
        // Sample variance
        vec3 s1 = texture2D(tex0, (block_center + vec2(-u_block_size*0.25, -u_block_size*0.25)) / u_resolution).rgb;
        vec3 s2 = texture2D(tex0, (block_center + vec2(u_block_size*0.25, -u_block_size*0.25)) / u_resolution).rgb;
        vec3 s3 = texture2D(tex0, (block_center + vec2(-u_block_size*0.25, u_block_size*0.25)) / u_resolution).rgb;
        vec3 s4 = texture2D(tex0, (block_center + vec2(u_block_size*0.25, u_block_size*0.25)) / u_resolution).rgb;
        
        vec3 mean = (s1 + s2 + s3 + s4) / 4.0;
        float variance = length(s1 - mean) + length(s2 - mean) + length(s3 - mean) + length(s4 - mean);
        variance /= 4.0;
        
        if (variance > u_segmentation_threshold) {
            vec3 block_avg = mean;
            vec4 block_color = vec4(block_avg, color.a);
            color = mix(color, block_color, u_segmentation_intensity);
        }
    }
    
    gl_FragColor = color;
}

