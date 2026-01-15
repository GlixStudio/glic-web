#!/usr/bin/env python3
"""
Script to generate TypeScript filter coefficients for wavelets from PyWavelets.
This helps create custom implementations for wavelets that don't work in discrete-wavelets.
"""

try:
    import pywt
    import json
except ImportError:
    print("Error: pywt (PyWavelets) is required. Install with: pip install PyWavelets")
    exit(1)

def get_wavelet_filters(wavelet_name):
    """Get filter coefficients for a wavelet from PyWavelets."""
    try:
        # Get filter bank
        filters = pywt.Wavelet(wavelet_name).filter_bank
        
        # PyWavelets returns: (dec_lo, dec_hi, rec_lo, rec_hi)
        dec_lo, dec_hi, rec_lo, rec_hi = filters
        
        return {
            'lowPassDecom': list(dec_lo),
            'highPassDecom': list(dec_hi),
            'lowPassRecon': list(rec_lo),
            'highPassRecon': list(rec_hi)
        }
    except Exception as e:
        print(f"Error getting filters for {wavelet_name}: {e}")
        return None

def format_coefficients(coeffs, indent=8):
    """Format coefficients as TypeScript array."""
    lines = []
    for i in range(0, len(coeffs), 4):
        chunk = coeffs[i:i+4]
        formatted = ', '.join(f'{c:.15f}' for c in chunk)
        if i == 0:
            lines.append(' ' * indent + formatted)
        else:
            lines.append(' ' * indent + formatted)
    return ',\n'.join(lines)

def generate_typescript(wavelet_name, filters):
    """Generate TypeScript code for a wavelet filter."""
    name_upper = wavelet_name.upper().replace('.', '_').replace('-', '_')
    
    ts_code = f"""// {wavelet_name.upper()} - Filter coefficients from PyWavelets
const {name_upper}_FILTERS = {{
    lowPassDecom: [
{format_coefficients(filters['lowPassDecom'])}
    ],
    highPassDecom: [
{format_coefficients(filters['highPassDecom'])}
    ],
    lowPassRecon: [
{format_coefficients(filters['lowPassRecon'])}
    ],
    highPassRecon: [
{format_coefficients(filters['highPassRecon'])}
    ]
}};
"""
    return ts_code

def main():
    # List of wavelets that need custom implementations
    wavelets_to_generate = [
        # Biorthogonal
        'bior1.1', 'bior1.3', 'bior1.5',
        'bior2.2', 'bior2.4', 'bior2.6', 'bior2.8',
        'bior3.3', 'bior3.5', 'bior3.7', 'bior3.9',
        'bior4.4', 'bior5.5', 'bior6.8',
        # Coiflets
        'coif1', 'coif2', 'coif3', 'coif4', 'coif5',
        # Symlets
        'sym2', 'sym3', 'sym4', 'sym5', 'sym6', 'sym7', 'sym8',
        'sym10', 'sym11', 'sym12', 'sym13', 'sym14', 'sym15',
        'sym16', 'sym17', 'sym18', 'sym19', 'sym20',
        # Daubechies (if needed)
        'db2', 'db3', 'db4', 'db5', 'db6', 'db7', 'db8',
        'db9', 'db10', 'db11', 'db12', 'db13', 'db14', 'db15',
        'db16', 'db17', 'db18', 'db19', 'db20',
    ]
    
    print("// Generated wavelet filter coefficients from PyWavelets")
    print("// Run: python scripts/generate-wavelet-filters.py > temp_filters.ts")
    print("")
    
    successful = []
    failed = []
    
    for wavelet_name in wavelets_to_generate:
        filters = get_wavelet_filters(wavelet_name)
        if filters:
            ts_code = generate_typescript(wavelet_name, filters)
            print(ts_code)
            successful.append(wavelet_name)
        else:
            failed.append(wavelet_name)
    
    print(f"\n// Successfully generated: {len(successful)} wavelets")
    print(f"// Failed: {len(failed)} wavelets")
    if failed:
        print(f"// Failed wavelets: {', '.join(failed)}")

if __name__ == '__main__':
    main()

