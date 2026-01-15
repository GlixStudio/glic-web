/**
 * Test script to identify which wavelets fail in the discrete-wavelets library
 * and need custom implementations
 */

import wt from 'discrete-wavelets';
import { getWaveletName, WAVELETNO } from './core/Transformations';
import { isCustomWavelet, getCustomWaveletFilters, customDwt, customIdwt } from './core/CustomWavelets';

// Test signal - power of 2 length
const TEST_SIGNAL = Array.from({ length: 64 }, (_, i) => Math.sin(i * 0.1) + Math.random() * 0.1);

interface WaveletTestResult {
    id: number;
    name: string;
    libraryWorks: boolean;
    libraryError?: string;
    hasCustomImplementation: boolean;
    customWorks?: boolean;
    customError?: string;
    needsCustomImplementation: boolean;
}

/**
 * Test a single wavelet with the library
 */
function testLibraryWavelet(name: string): { works: boolean; error?: string } {
    try {
        const result = wt.dwt(TEST_SIGNAL, name);
        // Verify result is valid
        if (!result || !Array.isArray(result) || result.length !== 2) {
            return { works: false, error: 'Invalid result structure' };
        }
        const [cA, cD] = result;
        if (!Array.isArray(cA) || !Array.isArray(cD)) {
            return { works: false, error: 'Invalid coefficient arrays' };
        }
        // Test inverse transform
        const reconstructed = wt.idwt(cA, cD, name);
        if (!Array.isArray(reconstructed) || reconstructed.length !== TEST_SIGNAL.length) {
            return { works: false, error: 'Inverse transform failed' };
        }
        return { works: true };
    } catch (error) {
        return { works: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Test a custom wavelet implementation
 */
function testCustomWavelet(name: string): { works: boolean; error?: string } {
    const filters = getCustomWaveletFilters(name);
    if (!filters) {
        return { works: false, error: 'No custom filters found' };
    }
    
    try {
        const result = customDwt(TEST_SIGNAL, filters);
        if (!result || !Array.isArray(result) || result.length !== 2) {
            return { works: false, error: 'Invalid result structure' };
        }
        const [cA, cD] = result;
        if (!Array.isArray(cA) || !Array.isArray(cD)) {
            return { works: false, error: 'Invalid coefficient arrays' };
        }
        // Test inverse transform
        const reconstructed = customIdwt(cA, cD, filters);
        if (!Array.isArray(reconstructed) || reconstructed.length !== TEST_SIGNAL.length) {
            return { works: false, error: 'Inverse transform failed' };
        }
        return { works: true };
    } catch (error) {
        return { works: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Test all wavelets
 */
function testAllWavelets(): WaveletTestResult[] {
    const results: WaveletTestResult[] = [];
    
    // Test all wavelet IDs from 1 to 67 (excluding -1, 0, and 68)
    for (let id = 1; id < WAVELETNO; id++) {
        const name = getWaveletName(id);
        const hasCustom = isCustomWavelet(name);
        
        // Test library implementation
        const libraryTest = testLibraryWavelet(name);
        
        // Test custom implementation if it exists
        let customTest: { works: boolean; error?: string } | undefined;
        if (hasCustom) {
            customTest = testCustomWavelet(name);
        }
        
        const result: WaveletTestResult = {
            id,
            name,
            libraryWorks: libraryTest.works,
            libraryError: libraryTest.error,
            hasCustomImplementation: hasCustom,
            customWorks: customTest?.works,
            customError: customTest?.error,
            needsCustomImplementation: !libraryTest.works && (!hasCustom || !customTest?.works)
        };
        
        results.push(result);
    }
    
    return results;
}

/**
 * Main test function
 */
function runTests() {
    console.log('Testing all wavelets...\n');
    console.log(`Test signal length: ${TEST_SIGNAL.length}\n`);
    
    const results = testAllWavelets();
    
    // Categorize results
    const working = results.filter(r => r.libraryWorks);
    const failing = results.filter(r => !r.libraryWorks);
    const hasCustom = results.filter(r => r.hasCustomImplementation);
    const needsCustom = results.filter(r => r.needsCustomImplementation);
    const customWorking = results.filter(r => r.hasCustomImplementation && r.customWorks);
    const customFailing = results.filter(r => r.hasCustomImplementation && !r.customWorks);
    
    console.log('=== SUMMARY ===\n');
    console.log(`Total wavelets tested: ${results.length}`);
    console.log(`Library working: ${working.length}`);
    console.log(`Library failing: ${failing.length}`);
    console.log(`Has custom implementation: ${hasCustom.length}`);
    console.log(`Custom implementations working: ${customWorking.length}`);
    console.log(`Custom implementations failing: ${customFailing.length}`);
    console.log(`Needs custom implementation: ${needsCustom.length}\n`);
    
    if (failing.length > 0) {
        console.log('=== FAILING WAVELETS (Library) ===\n');
        failing.forEach(r => {
            console.log(`ID ${r.id}: ${r.name}`);
            console.log(`  Error: ${r.libraryError}`);
            console.log(`  Has custom: ${r.hasCustomImplementation}`);
            if (r.hasCustomImplementation) {
                console.log(`  Custom works: ${r.customWorks}`);
                if (r.customError) {
                    console.log(`  Custom error: ${r.customError}`);
                }
            }
            console.log('');
        });
    }
    
    if (needsCustom.length > 0) {
        console.log('=== WAVELETS NEEDING CUSTOM IMPLEMENTATION ===\n');
        needsCustom.forEach(r => {
            console.log(`ID ${r.id}: ${r.name}`);
            console.log(`  Library error: ${r.libraryError}`);
            if (r.hasCustomImplementation && r.customError) {
                console.log(`  Custom error: ${r.customError}`);
            }
            console.log('');
        });
    }
    
    if (customFailing.length > 0) {
        console.log('=== CUSTOM IMPLEMENTATIONS THAT FAIL ===\n');
        customFailing.forEach(r => {
            console.log(`ID ${r.id}: ${r.name}`);
            console.log(`  Error: ${r.customError}`);
            console.log('');
        });
    }
    
    // Generate a report of wavelets that need custom implementations
    if (needsCustom.length > 0) {
        console.log('=== RECOMMENDATIONS ===\n');
        console.log('The following wavelets need custom implementations:');
        needsCustom.forEach(r => {
            console.log(`  - ${r.name} (ID: ${r.id})`);
        });
        console.log('\nYou can find filter coefficients for these wavelets in:');
        console.log('  - PyWavelets (Python): https://pywavelets.readthedocs.io/');
        console.log('  - Wavelets.jl (Julia): https://github.com/JuliaDSP/Wavelets.jl');
        console.log('  - MATLAB Wavelet Toolbox documentation');
    }
    
    return results;
}

// Run tests when this file is executed directly
runTests();

export type { WaveletTestResult };

export { testAllWavelets, testLibraryWavelet, testCustomWavelet };
