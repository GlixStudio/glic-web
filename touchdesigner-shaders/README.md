# GLIC Shaders for TouchDesigner

This directory contains GLSL shader files implementing GLIC (GLitch Image Codec) effects for real-time image processing in TouchDesigner.

## Shader Files

### Individual Effect Shaders

1. **glic_quantization.glsl** - Quantization/posterization effect
2. **glic_paeth_prediction.glsl** - Paeth prediction (blocky glitch effect)
3. **glic_median_prediction.glsl** - Median prediction
4. **glic_truemotion_prediction.glsl** - True motion prediction
5. **glic_colorspace_ycbcr.glsl** - YCbCr color space conversion
6. **glic_colorspace_yuv.glsl** - YUV color space conversion
7. **glic_block_segmentation.glsl** - Block-based segmentation effect
8. **glic_combined.glsl** - Combined shader with multiple effects

## How to Use in TouchDesigner

### Method 1: GLSL Material

1. Create a **GLSL Material** operator
2. Load the shader file in the Material's shader settings
3. Connect your input texture
4. Adjust uniform parameters

### Method 2: GLSL TOP

1. Create a **GLSL TOP** operator
2. Paste the shader code into the Fragment Shader field
3. Connect your input texture
4. Set up uniform parameters

### Uniform Parameters

Each shader has different parameters. Common ones include:

- `u_resolution` (vec2) - Resolution of the input texture
- `u_quantization` (float) - Quantization amount (0.0-1.0)
- `u_block_size` (float) - Block size in pixels
- `u_intensity` (float) - Effect intensity (0.0-1.0)
- `u_time` (float) - Time for animation

## Example Setup

1. Create a **Movie File In** or **Camera In** TOP
2. Create a **GLSL Material** or **GLSL TOP**
3. Load one of the shader files
4. Connect the input to the shader
5. Adjust parameters in real-time

## Notes

- All shaders expect normalized texture coordinates (0.0-1.0)
- Some shaders require multiple passes for best results
- Block-based effects work best with power-of-2 block sizes
- For animated effects, use CHOPs to drive uniform parameters

