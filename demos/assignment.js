// This demo demonstrates simple cubemap reflections and more complex planar reflections

import PicoGL from "../node_modules/picogl/build/module/picogl.js";
import {mat4, vec3, mat3, vec4, vec2} from "../node_modules/gl-matrix/esm/index.js";

import {positions, normals, uvs} from "../blender/gril.js"
import {positions as maskPos, normals as maskNorm, uvs as maskUvs} from "../blender/mask.js"
import {positions as mirrorPositions, uvs as mirrorUvs, indices as mirrorIndices} from "../blender/plane.js"

let skyboxPositions = new Float32Array([
    -1.0, 1.0, 1.0,
    1.0, 1.0, 1.0,
    -1.0, -1.0, 1.0,
    1.0, -1.0, 1.0
]);

let skyboxTriangles = new Uint32Array([
    0, 2, 1,
    2, 3, 1
]);

// ******************************************************
// **               Light configuration                **
// ******************************************************

let ambientLightColor = vec3.fromValues(0.0, 0.05, 0.1);
let numberOfLights = 2;
let lightColors = [vec3.fromValues(1.0, 0.0, 0.4), vec3.fromValues(0.0, 0.2, 0.3)];
let lightInitialPositions = [vec3.fromValues(5, 0, 2), vec3.fromValues(-5, 0, 2)];
let lightPositions = [vec3.create(), vec3.create()];

// language=GLSL
let lightCalculationShader = `
    uniform vec3 cameraPos;
    uniform vec3 ambientLightColor;    
    uniform vec3 lightColors[${numberOfLights}];        
    uniform vec3 lightPositions[${numberOfLights}];
    
    // This function calculates light reflection using Phong reflection model (ambient + diffuse + specular)
    vec4 calculateLights(vec3 normal, vec3 position) {
        vec3 viewDirection = normalize(cameraPos.xyz - position);
        vec4 color = vec4(ambientLightColor, 1.0);
                
        for (int i = 0; i < lightPositions.length(); i++) {
            vec3 lightDirection = normalize(lightPositions[i] - position);
            
            // Lambertian reflection (ideal diffuse of matte surfaces) is also a part of Phong model                        
            float diffuse = max(dot(lightDirection, normal), -0.1);                                    
                      
            // Phong specular highlight 
            float specular = pow(max(dot(viewDirection, reflect(-lightDirection, normal)), 0.0), 30.0);
            
            // Blinn-Phong improved specular highlight                        
            //float specular = pow(max(dot(normalize(lightDirection + viewDirection), normal), 0.0), 200.0);
            
            color.rgb += lightColors[i] * diffuse + specular;
        }
        return color;
    }
`;

// language=GLSL
let fragmentShader = `
    #version 300 es
    precision highp float;
    ${lightCalculationShader}
    
    //uniform samplerCube cubemap;    
    
    in vec3 vPosition;  
    in vec3 vNormal;
    in vec3 viewDir;
    
    out vec4 outColor;
    
    void main()
    {        
        vec3 reflectedDir = reflect(viewDir, normalize(vNormal));
        //outColor = texture(cubemap, reflectedDir);
        outColor = calculateLights(normalize(vNormal), vPosition);
        // Try using a higher mipmap LOD to get a rough material effect without any performance impact
        //outColor = textureLod(cubemap, reflectedDir, 7.0);
    }
`;

// language=GLSL
let vertexShader = `
    #version 300 es
    ${lightCalculationShader}
            
    uniform mat4 modelViewProjectionMatrix;
    uniform mat4 modelMatrix;
    uniform mat3 normalMatrix;
    uniform vec3 cameraPosition; 
    
    layout(location=0) in vec4 position;
    layout(location=1) in vec3 normal;
    layout(location=2) in vec2 uv;
        
    out vec3 vPosition;
    out vec2 vUv;
    out vec3 vNormal;
    out vec3 viewDir;
    out vec4 vColor;
    
    void main()
    {
        gl_Position = modelViewProjectionMatrix * position;           
        vUv = uv;
        viewDir = (modelMatrix * position).xyz - cameraPosition;                
        vNormal = normalMatrix * normal;
        vColor = calculateLights(normalize(vNormal), vPosition);
    }
`;

// language=GLSL
let maskFragmentShader = `
    #version 300 es
    precision highp float;
    ${lightCalculationShader}
    
    uniform samplerCube cubemap;    
        
    in vec3 vNormal;
    in vec3 viewDir;
    
    out vec4 outColor;
    
    void main()
    {        
        vec3 reflectedDir = reflect(viewDir, normalize(vNormal));
        outColor = texture(cubemap, reflectedDir);
        
        // Try using a higher mipmap LOD to get a rough material effect without any performance impact
        //outColor = textureLod(cubemap, reflectedDir, 7.0);
    }
`;

// language=GLSL
let maskVertexShader = `
    #version 300 es
    ${lightCalculationShader}
            
    uniform mat4 modelViewProjectionMatrix;
    uniform mat4 modelMatrix;
    uniform mat3 normalMatrix;
    uniform vec3 cameraPosition; 
    
    layout(location=0) in vec4 position;
    layout(location=1) in vec3 normal;
    layout(location=2) in vec2 uv;
        
    out vec2 vUv;
    out vec3 vNormal;
    out vec3 viewDir;
    
    void main()
    {
        gl_Position = modelViewProjectionMatrix * position;           
        vUv = uv;
        viewDir = (modelMatrix * position).xyz - cameraPosition;                
        vNormal = normalMatrix * normal;
    }
`;

// language=GLSL
let mirrorFragmentShader = `
    #version 300 es
    precision highp float;
    
    uniform sampler2D reflectionTex;
    uniform sampler2D distortionMap;
    uniform vec2 screenSize;
    
    in vec2 vUv;        
        
    out vec4 outColor;
    
    void main()
    {                        
        vec2 screenPos = gl_FragCoord.xy / screenSize;
        
        // 0.03 is a mirror distortion factor, try making a larger distortion         
        screenPos.x += (texture(distortionMap, vUv).r - 0.5) * 0.09;
        outColor = texture(reflectionTex, screenPos);
    }
`;

// language=GLSL
let mirrorVertexShader = `
    #version 300 es
            
    uniform mat4 modelViewProjectionMatrix;
    
    layout(location=0) in vec4 position;   
    layout(location=1) in vec2 uv;
    
    out vec2 vUv;
        
    void main()
    {
        vUv = uv;
        gl_Position = modelViewProjectionMatrix * position;           
    }
`;

// language=GLSL
let skyboxFragmentShader = `
    #version 300 es
    precision mediump float;
    
    uniform samplerCube cubemap;
    uniform mat4 viewProjectionInverse;
    
    in vec4 v_position;
    
    out vec4 outColor;
    
    void main() {
      vec4 t = viewProjectionInverse * v_position;
      outColor = texture(cubemap, normalize(t.xyz / t.w));
    }
`;

// language=GLSL
let skyboxVertexShader = `
    #version 300 es
    
    layout(location=0) in vec4 position;
    out vec4 v_position;
    
    void main() {
      v_position = position;
      gl_Position = position;
    }
`;

app.enable(PicoGL.DEPTH_TEST);

let program = app.createProgram(vertexShader.trim(), fragmentShader.trim());
let maskProgram = app.createProgram(maskVertexShader.trim(), maskFragmentShader.trim());
let skyboxProgram = app.createProgram(skyboxVertexShader, skyboxFragmentShader);
let mirrorProgram = app.createProgram(mirrorVertexShader, mirrorFragmentShader);

let vertexArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, positions))
    .vertexAttributeBuffer(1, app.createVertexBuffer(PicoGL.FLOAT, 3, normals))
    .vertexAttributeBuffer(2, app.createVertexBuffer(PicoGL.FLOAT, 2, uvs))

let maskVertexArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, maskPos))
    .vertexAttributeBuffer(1, app.createVertexBuffer(PicoGL.FLOAT, 3, maskNorm))
    .vertexAttributeBuffer(2, app.createVertexBuffer(PicoGL.FLOAT, 2, maskUvs))
    //.indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, indices));

let skyboxArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, skyboxPositions))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, skyboxTriangles));

let mirrorArray = app.createVertexArray()
    .vertexAttributeBuffer(0, app.createVertexBuffer(PicoGL.FLOAT, 3, mirrorPositions))
    .vertexAttributeBuffer(1, app.createVertexBuffer(PicoGL.FLOAT, 2, mirrorUvs))
    .indexBuffer(app.createIndexBuffer(PicoGL.UNSIGNED_INT, 3, mirrorIndices));

// Change the reflection texture resolution to checkout the difference
let reflectionResolutionFactor = 0.2;
let reflectionColorTarget = app.createTexture2D(app.width * reflectionResolutionFactor, app.height * reflectionResolutionFactor, {magFilter: PicoGL.LINEAR});
let reflectionDepthTarget = app.createTexture2D(app.width * reflectionResolutionFactor, app.height * reflectionResolutionFactor, {internalFormat: PicoGL.DEPTH_COMPONENT16});
let reflectionBuffer = app.createFramebuffer().colorTarget(0, reflectionColorTarget).depthTarget(reflectionDepthTarget);

let projMatrix = mat4.create();
let viewMatrix = mat4.create();
let viewProjMatrix = mat4.create();
let modelMatrix = mat4.create();
let modelViewMatrix = mat4.create();
let modelViewProjectionMatrix = mat4.create();
let rotateXMatrix = mat4.create();
let rotateYMatrix = mat4.create();

let maskProjMatrix = mat4.create();
let maskViewMatrix = mat4.create();
let maskViewProjMatrix = mat4.create();
let maskModelMatrix = mat4.create();
let maskModelViewMatrix = mat4.create();
let maskModelViewProjectionMatrix = mat4.create();
let rotationYMatrix = mat4.create();

let mirrorModelMatrix = mat4.create();
let mirrorModelViewProjectionMatrix = mat4.create();
let maskMirrorModelMatrix = mat4.create();
let maskMirrorModelViewProjectionMatrix = mat4.create();
let skyboxViewProjectionInverse = mat4.create();
let cameraPosition = vec3.create();

const positionsBuffer = new Float32Array(numberOfLights * 3);
const colorsBuffer = new Float32Array(numberOfLights * 3);

function calculateSurfaceReflectionMatrix(reflectionMat, mirrorModelMatrix, maskMirrorModelMatrix, surfaceNormal) {
    let normal = vec3.transformMat3(vec3.create(), surfaceNormal, mat3.normalFromMat4(mat3.create(), mirrorModelMatrix, maskMirrorModelMatrix));
    let pos = mat4.getTranslation(vec3.create(), mirrorModelMatrix, maskMirrorModelMatrix);
    let d = -vec3.dot(normal, pos);
    let plane = vec4.fromValues(normal[0], normal[1], normal[2], d);

    reflectionMat[0] = (1 - 2 * plane[0] * plane[0]);
    reflectionMat[4] = ( - 2 * plane[0] * plane[1]);
    reflectionMat[8] = ( - 2 * plane[0] * plane[2]);
    reflectionMat[12] = ( - 2 * plane[3] * plane[0]);

    reflectionMat[1] = ( - 2 * plane[1] * plane[0]);
    reflectionMat[5] = (1 - 2 * plane[1] * plane[1]);
    reflectionMat[9] = ( - 2 * plane[1] * plane[2]);
    reflectionMat[13] = ( - 2 * plane[3] * plane[1]);

    reflectionMat[2] = ( - 2 * plane[2] * plane[0]);
    reflectionMat[6] = ( - 2 * plane[2] * plane[1]);
    reflectionMat[10] = (1 - 2 * plane[2] * plane[2]);
    reflectionMat[14] = ( - 2 * plane[3] * plane[2]);

    reflectionMat[3] = 0;
    reflectionMat[7] = 0;
    reflectionMat[11] = 0;
    reflectionMat[15] = 1;

    return reflectionMat;
}

async function loadTexture(fileName) {
    return await createImageBitmap(await (await fetch("images/" + fileName)).blob());
}

(async () => {
    const cubemap = app.createCubemap({
            negX: await loadTexture("left.png"),
            posX: await loadTexture("right.png"),
            negY: await loadTexture("bot.png"),
            posY: await loadTexture("top.png"),
            negZ: await loadTexture("back.png"),
            posZ: await loadTexture("front.png")
    });

    let drawCall = app.createDrawCall(program, vertexArray)
        //.texture("cubemap", cubemap)
        .uniform("ambientLightColor", ambientLightColor);

    let maskDrawCall = app.createDrawCall(maskProgram, maskVertexArray)
        .texture("cubemap", cubemap)
        .uniform("ambientLightColor", ambientLightColor);

    let skyboxDrawCall = app.createDrawCall(skyboxProgram, skyboxArray)
        .texture("cubemap", cubemap);

    let mirrorDrawCall = app.createDrawCall(mirrorProgram, mirrorArray)
        .texture("reflectionTex", reflectionColorTarget)
        .texture("distortionMap", app.createTexture2D(await loadTexture("vectors.jpg")));

    function renderReflectionTexture()
    {
        app.drawFramebuffer(reflectionBuffer);
        app.viewport(0, 0, reflectionColorTarget.width, reflectionColorTarget.height);

        app.gl.cullFace(app.gl.FRONT);

        let reflectionMatrix = calculateSurfaceReflectionMatrix(mat4.create(), mirrorModelMatrix, maskMirrorModelMatrix, vec3.fromValues(0, 0, 1));
        let reflectionViewMatrix = mat4.mul(mat4.create(), viewMatrix, reflectionMatrix);
        let reflectionCameraPosition = vec3.transformMat4(vec3.create(), cameraPosition, reflectionMatrix);
        drawObjects(reflectionCameraPosition, reflectionViewMatrix);

        app.gl.cullFace(app.gl.BACK);
        app.defaultDrawFramebuffer();
        app.defaultViewport();
    }

    function drawObjects(cameraPosition, viewMatrix) {
        mat4.multiply(viewProjMatrix, projMatrix, viewMatrix);
        mat4.multiply(maskViewProjMatrix, maskProjMatrix, maskViewMatrix);

        mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);
        mat4.multiply(modelViewProjectionMatrix, viewProjMatrix, modelMatrix);
        mat4.multiply(maskModelViewMatrix, maskViewMatrix, maskModelMatrix);
        mat4.multiply(maskModelViewProjectionMatrix, maskViewProjMatrix, maskModelMatrix);

        let skyboxView = mat4.clone(viewMatrix);
        skyboxView[12] = 0;
        skyboxView[13] = 0;
        skyboxView[14] = 0;
        let skyboxViewProjectionMatrix = mat4.create();
        mat4.mul(skyboxViewProjectionMatrix, projMatrix, skyboxView);
        mat4.invert(skyboxViewProjectionInverse, skyboxViewProjectionMatrix);

        app.clear();

        app.disable(PicoGL.DEPTH_TEST);
        app.gl.cullFace(app.gl.FRONT);
        skyboxDrawCall.uniform("viewProjectionInverse", skyboxViewProjectionInverse);
        skyboxDrawCall.draw();

        app.enable(PicoGL.DEPTH_TEST);
        app.gl.cullFace(app.gl.BACK);
        maskDrawCall.uniform("modelViewProjectionMatrix", maskModelViewProjectionMatrix);
        maskDrawCall.uniform("cameraPosition", cameraPosition);
        maskDrawCall.uniform("modelMatrix", maskModelMatrix);
        maskDrawCall.uniform("normalMatrix", mat3.normalFromMat4(mat3.create(), maskModelMatrix));
        mat4.fromRotationTranslationScale(maskModelMatrix, rotationYMatrix, vec3.fromValues(0, -0.5, 1), [20, -45, 20]);
        maskDrawCall.draw();

        drawCall.uniform("modelViewProjectionMatrix", modelViewProjectionMatrix);
        drawCall.uniform("cameraPosition", cameraPosition);
        drawCall.uniform("modelMatrix", modelMatrix);
        drawCall.uniform("normalMatrix", mat3.normalFromMat4(mat3.create(), modelMatrix));
        mat4.fromRotationTranslationScale(modelMatrix, rotateYMatrix, vec3.fromValues(0, 1, -0.5), [0.1, -0.1, 0.1]);
        drawCall.draw();
    }

    function drawMirror() {
        mat4.multiply(mirrorModelViewProjectionMatrix, viewProjMatrix, mirrorModelMatrix);
        mat4.multiply(maskMirrorModelViewProjectionMatrix, maskViewProjMatrix, maskMirrorModelMatrix);
        mirrorDrawCall.uniform("modelViewProjectionMatrix", mirrorModelViewProjectionMatrix);
        mirrorDrawCall.uniform("screenSize", vec2.fromValues(app.width, app.height))
        mirrorDrawCall.draw();
    }

    function draw() {
        let time = new Date().getTime() * 0.001;

        mat4.perspective(projMatrix, Math.PI / 2.5, app.width / app.height, 0.1, 100.0);
        //mat4.perspective(maskProjMatrix, Math.PI / 2.5, app.width / app.height, 0.1, 100.0);
        vec3.rotateY(cameraPosition, vec3.fromValues(0, 3, 3.5), vec3.fromValues(0, 0, 0), time * 0.049);
        mat4.lookAt(viewMatrix, cameraPosition, vec3.fromValues(0, 2, 0), vec3.fromValues(0, 1, 0));
        
        mat4.fromZRotation(rotateYMatrix, time * 0.2235);

        mat4.fromYRotation(rotationYMatrix, time * 0.2354);


        mat4.fromXRotation(rotateXMatrix, 0.3);
        mat4.fromYRotation(rotateYMatrix, time * 0.2354);
        mat4.mul(mirrorModelMatrix, maskMirrorModelMatrix, rotateYMatrix, rotateXMatrix);
        mat4.translate(mirrorModelMatrix, mirrorModelMatrix, vec3.fromValues(0, 1.4, -0.7));

        for (let i = 0; i < numberOfLights; i++) {
            vec3.rotateZ(lightPositions[i], lightInitialPositions[i], vec3.fromValues(0, 0, 0), time);
            positionsBuffer.set(lightPositions[i], i * 3);
            colorsBuffer.set(lightColors[i], i * 3);
        }
    
        drawCall.uniform("lightPositions[0]", positionsBuffer);
        drawCall.uniform("lightColors[0]", colorsBuffer);

        renderReflectionTexture();
        drawObjects(cameraPosition, viewMatrix, maskViewMatrix);
        drawMirror();

        requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
})();
