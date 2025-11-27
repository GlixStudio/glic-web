# GLIC Shaders Quick Reference

## Available Shaders

### Basic Effects
- **glic_quantization.glsl** - Posterization/quantization effect
- **glic_block_segmentation.glsl** - Adaptive blocky segmentation

### Prediction Effects (Blocky Glitch)
- **glic_paeth_prediction.glsl** - Paeth predictor (most common, PNG-style)
- **glic_median_prediction.glsl** - Median predictor (smooth blocks)
- **glic_truemotion_prediction.glsl** - True motion predictor (directional)
- **glic_avg_prediction.glsl** - Average predictor (horizontal + vertical)
- **glic_corner_prediction.glsl** - Corner predictor (uses corner pixel)
- **glic_horizontal_prediction.glsl** - Horizontal predictor (uses left pixel)
- **glic_vertical_prediction.glsl** - Vertical predictor (uses top pixel)

### Color Space Effects
- **glic_colorspace_ycbcr.glsl** - YCbCr color space conversion
- **glic_colorspace_yuv.glsl** - YUV color space conversion

### Combined
- **glic_combined.glsl** - All effects in one shader (most efficient)

## Common Uniforms

All shaders require:
- `u_resolution` (vec2) - Input texture resolution, e.g., `1920 1080`

Most prediction shaders use:
- `u_block_size` (float) - Block size in pixels (try: 8, 16, 32, 64)
- `u_intensity` (float) - Effect strength (0.0-1.0)
- `u_offset_x` (float) - Horizontal block offset
- `u_offset_y` (float) - Vertical block offset

## Quick Parameter Ranges

| Parameter | Typical Range | Effect |
|-----------|---------------|--------|
| `u_quantization` | 0.0 - 1.0 | Lower = more quantization |
| `u_block_size` | 4 - 128 | Smaller = finer blocks |
| `u_intensity` | 0.0 - 1.0 | Higher = stronger effect |
| `u_colorspace_mix` | 0.0 - 1.0 | 0 = RGB, 1 = converted |
| `u_segmentation_threshold` | 0.0 - 1.0 | Higher = more blocks |

## Recommended Starting Values

### For Subtle Glitch
- `u_block_size`: 32
- `u_intensity`: 0.3
- `u_quantization`: 0.5

### For Strong Glitch
- `u_block_size`: 16
- `u_intensity`: 0.8
- `u_quantization`: 0.2

### For Extreme Glitch
- `u_block_size`: 8
- `u_intensity`: 1.0
- `u_quantization`: 0.1

## Effect Combinations

### Classic Glitch
1. Quantization (0.3)
2. Paeth Prediction (block_size: 16, intensity: 0.7)
3. YCbCr Colorspace (mix: 0.4)

### Blocky Artifact
1. Block Segmentation (threshold: 0.5, block_size: 32)
2. Median Prediction (intensity: 0.6)

### Color Shift Glitch
1. YUV Colorspace (mix: 0.8, channel_shift: [0.1, 0.0, 0.0])
2. Quantization (0.4)

## TouchDesigner Quick Setup

1. Create **GLSL TOP**
2. Load shader file (copy/paste code)
3. Connect input texture
4. Set `u_resolution` to input resolution
5. Adjust other parameters
6. Connect to output

## Animation Ideas

- Animate `u_offset_x` with sine wave for horizontal drift
- Animate `u_block_size` with noise for random block sizes
- Animate `u_intensity` with LFO for pulsing effect
- Animate `u_colorspace_mix` for color shifting

