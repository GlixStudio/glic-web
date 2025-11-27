// GLIC Block Segmentation Shader for TouchDesigner
// Implements block-based segmentation creating adaptive blocky effects

uniform sampler2D tex0;
uniform vec2 u_resolution;
uniform float u_block_size; // Base block size in pixels
uniform float u_segmentation_threshold; // Variance threshold (0.0-1.0)
uniform float u_min_block_size; // Minimum block size
uniform float u_max_block_size; // Maximum block size
uniform float u_intensity; // Effect intensity

vec2 vTexCoord = gl_FragCoord.xy / u_resolution;

// Calculate simplified variance for a block
float calculateVariance(vec2 block_center, float block_size) {
    float sample_size = max(2.0, block_size * 0.25);
    vec3 samples[4];
    
    samples[0] = texture2D(tex0, (block_center + vec2(-sample_size, -sample_size)) / u_resolution).rgb;
    samples[1] = texture2D(tex0, (block_center + vec2(sample_size, -sample_size)) / u_resolution).rgb;
    samples[2] = texture2D(tex0, (block_center + vec2(-sample_size, sample_size)) / u_resolution).rgb;
    samples[3] = texture2D(tex0, (block_center + vec2(sample_size, sample_size)) / u_resolution).rgb;
    
    vec3 mean = (samples[0] + samples[1] + samples[2] + samples[3]) / 4.0;
    float variance = 0.0;
    for(int i = 0; i < 4; i++) {
        variance += length(samples[i] - mean);
    }
    return variance / 4.0;
}

// Get block average color
vec3 getBlockAverage(vec2 block_pos, float block_size) {
    vec3 sum = vec3(0.0);
    float count = 0.0;
    float step = max(1.0, block_size * 0.1);
    
    for(float x = 0.0; x < block_size; x += step) {
        for(float y = 0.0; y < block_size; y += step) {
            vec2 sample_pos = block_pos + vec2(x, y);
            if (sample_pos.x < u_resolution.x && sample_pos.y < u_resolution.y) {
                sum += texture2D(tex0, sample_pos / u_resolution).rgb;
                count += 1.0;
            }
        }
    }
    return count > 0.0 ? sum / count : vec3(0.0);
}

void main() {
    vec2 pixel = gl_FragCoord.xy;
    vec4 original = texture2D(tex0, vTexCoord);
    
    // Calculate block position
    float current_block_size = clamp(u_block_size, u_min_block_size, u_max_block_size);
    vec2 block_pos = floor(pixel / current_block_size) * current_block_size;
    vec2 block_center = block_pos + current_block_size * 0.5;
    
    // Calculate variance
    float variance = calculateVariance(block_center, current_block_size);
    
    vec4 color = original;
    
    // If variance exceeds threshold, use block average
    if (variance > u_segmentation_threshold) {
        vec3 block_avg = getBlockAverage(block_pos, current_block_size);
        vec4 block_color = vec4(block_avg, original.a);
        color = mix(original, block_color, u_intensity);
    }
    
    gl_FragColor = color;
}

