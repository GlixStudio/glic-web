# TouchDesigner Setup Guide for GLIC Shaders

## Quick Start

### Method 1: Using GLSL Material

1. **Create Input Source**
   - Add a `Movie File In` or `Camera In` TOP
   - Connect your video source

2. **Create GLSL Material**
   - Add a `GLSL Material` operator
   - In the Material's parameters:
     - Go to the **Shader** page
     - Click **Load** next to Fragment Shader
     - Select one of the `.glsl` files from this directory

3. **Create Geometry**
   - Add a `Rectangle` SOP or `Grid` SOP
   - Set it to match your input resolution

4. **Create Render**
   - Add a `Camera` COMP
   - Add a `Render` TOP
   - Connect the Geometry to Render
   - Set Material to your GLSL Material
   - Connect your input texture to the Material

5. **Set Uniforms**
   - In the GLSL Material parameters, you'll see uniform inputs
   - Set `u_resolution` to match your input resolution (e.g., `1920 1080`)
   - Adjust other parameters as needed

### Method 2: Using GLSL TOP (Recommended for Real-time)

1. **Create Input Source**
   - Add a `Movie File In` or `Camera In` TOP

2. **Create GLSL TOP**
   - Add a `GLSL TOP` operator
   - Connect your input to the first input

3. **Load Shader**
   - Open the GLSL TOP parameters
   - Go to the **GLSL** page
   - Click the **Fragment Shader** field
   - Open one of the `.glsl` files and copy/paste the code

4. **Set Uniforms**
   - In the GLSL TOP parameters, go to **Uniforms** page
   - Add uniform parameters:
     - `u_resolution` (vec2): Set to your resolution
     - Other uniforms as needed (see shader-specific parameters below)

## Shader-Specific Parameters

### Quantization Shader (`glic_quantization.glsl`)
- `u_quantization` (float): 0.0 = no effect, 1.0 = maximum quantization
- `u_channel_quant[3]` (float array): Per-channel quantization (optional)

### Prediction Shaders (Paeth, Median, True Motion, etc.)
- `u_block_size` (float): Block size in pixels (try 8, 16, 32, 64)
- `u_intensity` (float): 0.0 = original, 1.0 = full effect
- `u_offset_x` (float): Horizontal block offset (for animation)
- `u_offset_y` (float): Vertical block offset (for animation)

### Color Space Shaders (`glic_colorspace_ycbcr.glsl`, `glic_colorspace_yuv.glsl`)
- `u_colorspace_mix` (float): 0.0 = RGB, 1.0 = converted colorspace
- `u_channel_shift[3]` (float array): Per-channel shift in colorspace

### Block Segmentation (`glic_block_segmentation.glsl`)
- `u_block_size` (float): Base block size
- `u_segmentation_threshold` (float): Variance threshold (0.0-1.0)
- `u_min_block_size` (float): Minimum block size
- `u_max_block_size` (float): Maximum block size
- `u_intensity` (float): Effect intensity

### Combined Shader (`glic_combined.glsl`)
All parameters from above, plus:
- `u_enable_quantization` (int): 0 or 1
- `u_prediction_type` (int): 0=none, 1=paeth, 2=median, 3=truemotion
- `u_colorspace_type` (int): 0=none, 1=YCbCr, 2=YUV
- `u_enable_segmentation` (int): 0 or 1

## Animation Tips

### Using CHOPs for Animation

1. **Create a Math CHOP**
   - Set it to generate a sine wave or other function
   - Connect it to drive `u_offset_x` or `u_offset_y` for animated block offsets

2. **Create a Noise CHOP**
   - Use it to drive `u_block_size` for random block size variation

3. **Create a LFO CHOP**
   - Use it to animate `u_intensity` for pulsing effects

### Example CHOP Setup

```
Math CHOP (Sine Wave)
  → Export: u_offset_x
  → Frequency: 0.5 Hz
  → Range: -10 to 10

Noise CHOP
  → Export: u_block_size
  → Range: 8 to 64
```

## Performance Tips

1. **Start Simple**: Begin with quantization or simple prediction shaders
2. **Block Size**: Smaller block sizes (8-16px) are faster but less dramatic
3. **Resolution**: Lower resolutions will run faster
4. **Multiple Passes**: For complex effects, chain multiple GLSL TOPs
5. **Combined Shader**: Use `glic_combined.glsl` to combine effects in one pass (more efficient)

## Common Issues

### Shader Not Working
- Check that `u_resolution` is set correctly
- Ensure input texture is connected
- Check TouchDesigner's console for shader compilation errors

### Black Screen
- Verify texture coordinates are correct
- Check that `u_block_size` is not 0
- Ensure input texture has valid data

### Performance Issues
- Reduce block size
- Lower input resolution
- Disable unused effects in combined shader
- Use simpler prediction types

## Recommended Workflow

1. Start with `glic_quantization.glsl` to get familiar
2. Try `glic_paeth_prediction.glsl` for blocky glitch effects
3. Experiment with `glic_colorspace_ycbcr.glsl` for color shifts
4. Combine effects using `glic_combined.glsl` or chain multiple GLSL TOPs
5. Animate parameters with CHOPs for dynamic effects

## Example Network Structure

```
Movie File In
  ↓
GLSL TOP (Quantization)
  ↓
GLSL TOP (Paeth Prediction)
  ↓
GLSL TOP (YCbCr Colorspace)
  ↓
Null (Output)
```

Or use the combined shader:

```
Movie File In
  ↓
GLSL TOP (Combined - all effects)
  ↓
Null (Output)
```

