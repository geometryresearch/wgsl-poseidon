const assert = require('assert');
// Parcel should inline the fs module. See https://github.com/parcel-bundler/parcel/issues/8256
import { readFileSync } from 'fs';
import * as constants from './poseidon_constants';

// Define the storage buffer size
// TODO: figure out the correct size for the storage buffer

const shader = readFileSync('./shader.wgsl', 'utf8');

async function poseidon(input: BigInt) {
    const t = 2
    const constants_c = constants.default.C
    const constants_m = constants.default.M

    // Append the C constants
    let inputs: BigInt[] = [input];
    for (const c_val of constants_c[t - 2]) {
        inputs.push(BigInt(c_val));
    }

    // Append the M constants
    for (const vs of constants_m[t - 2]) {
        for (const v_val of vs) {
            inputs.push(BigInt(v_val))
        }
    }

    const input_bytes = new Uint8Array(
        bigints_to_limbs(inputs).buffer
    );

    const BUFFER_SIZE = input_bytes.length;
    console.log(inputs.length, BUFFER_SIZE)

    console.log(0)
    // 1: request adapter and device
    // @ts-ignore
    if (!navigator.gpu) {
        throw Error('WebGPU not supported.');
    }

    console.log(1)

    // @ts-ignore
    const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance',
    });
    if (!adapter) {
        throw Error('Couldn\'t request WebGPU adapter.');
    }

    const device = await adapter.requestDevice();

    // 2: Create a shader module from the shader template literal
    const shaderModule = device.createShaderModule({
        code: shader
    });

    console.log(2)

     //3: Create an output buffer to read GPU calculations to, and a staging
    //buffer to be mapped for JavaScript access

    const storageBuffer = device.createBuffer({
        size: BUFFER_SIZE,
        // @ts-ignore
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(storageBuffer, 0, input_bytes);

    const stagingBuffer = device.createBuffer({
        size: BUFFER_SIZE,
        // @ts-ignore
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
    });

    console.log(3)

    // 4: Create a GPUBindGroupLayout to define the bind group structure,
    // create a GPUBindGroup from it, then use it to create a
    // GPUComputePipeline
    const bindGroupLayout =
        device.createBindGroupLayout({
            entries: [{
                binding: 0,
                // @ts-ignore
                visibility: GPUShaderStage.COMPUTE,
                buffer: {
                    type: "storage"
                }
            }]
        });

    const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [{
            binding: 0,
            resource: {
                buffer: storageBuffer,
            }
        }]
    });

    const computePipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout]
        }),
        compute: {
            module: shaderModule,
            entryPoint: 'main'
        }
    });
    console.log(4)

    // 5: Create GPUCommandEncoder to issue commands to the GPU
    const commandEncoder = device.createCommandEncoder();

    console.log(5)

    // 6: Initiate render pass
    const passEncoder = commandEncoder.beginComputePass();

    console.log(6)

    // 7: Issue commands
    passEncoder.setPipeline(computePipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(1)

    // End the render pass
    passEncoder.end();

    // Copy output buffer to staging buffer
    commandEncoder.copyBufferToBuffer(
        storageBuffer,
        0, // Source offset
        stagingBuffer,
        0, // Destination offset
        BUFFER_SIZE
    );

    console.log(7)

    // 8: End frame by passing array of command buffers to command queue for execution
    device.queue.submit([commandEncoder.finish()]);
    console.log(7.1)

    // map staging buffer to read results back to JS
    await stagingBuffer.mapAsync(
        // @ts-ignore
        GPUMapMode.READ,
        0, // Offset
        BUFFER_SIZE // Length
    );
    console.log(7.2)

    const copyArrayBuffer = stagingBuffer.getMappedRange(0, BUFFER_SIZE);
    console.log(7.3)
    const data = copyArrayBuffer.slice();
    console.log(7.4)
    stagingBuffer.unmap();

    console.log(8)

    const codeOutput = document.getElementById("output");

    const dataBuf = new Uint32Array(data);
    const result = uint32ArrayToBigint(dataBuf.slice(0, 16))
    codeOutput.innerHTML = result.toString();
}

// From msm-webgpu
const uint32ArrayToBigint = (uint32Array: Uint32Array) => {
    // Convert the Uint16Array to a hex string
    let hexString = '';
    for (const uint32 of uint32Array) {
        hexString = uint32.toString(16).padStart(4, '0') + hexString;
    }

    // Convert the hex string to a BigInt
    return BigInt('0x' + hexString);
}

const bytes_to_bigints = (limbs: Uint8Array): BigInt[] => {
    assert(limbs.length % 32 === 0);

    let chunks: Number[][] = []
    // Split limbs into chunks of 32
    for (let i = 0; i < limbs.length / 32; i ++) {
        let chunk: Number[] = []
        for (let j = 0; j < 32; j ++) {
            chunk.push(limbs[i * 32 + j]);
        }
        chunks.push(chunk);
    }

    console.log(chunks);
    return []
}

const bigint_to_limbs = (val: BigInt): Uint32Array => {
    // From msm-webgpu
    // Convert the BigInt to a hex string
    const hexString = val.toString(16);

    // Pad the hex string with leading zeros, if necessary
    const paddedHexString = hexString.padStart(64, '0');

    // Split the padded hex string into an array of 16-bit values
    const uint32Array = new Uint32Array(paddedHexString.length / 4);
    for (let i = 0; i < paddedHexString.length; i += 4) {
        uint32Array[i / 4] = parseInt(paddedHexString.slice(i, i + 4), 16);
    }

    return uint32Array.reverse();
}

const bigints_to_limbs = (vals: BigInt[]): Uint32Array => {
    const result = new Uint32Array(vals.length * 16);

    for (let i = 0; i < vals.length; i ++ ) {
        const limbs = bigint_to_limbs(vals[i]);
        for (let j = 0; j < limbs.length; j ++ ) {
            result[i * 16 + j] = limbs[j];
        }
    }
    return result;
}

const main = async () => {
    await poseidon(BigInt(1));
}

main()