function VideoRenderer(params) {
  params = params || {};
  var selector = params.selector;
  this.overview = !!params.overview;
  this.container = document.querySelector(selector);
  // Track objects to render, keyed on UUID.
  this.trackObjects = {};

  this.referenceTime = new Date();
  // Initialize the scene.
  this.init();
}

VideoRenderer.prototype.setManager = function(manager) {
  this.manager = manager;

  // Create a trackObject for each track in the manager.
  for (var id in manager.tracks) {
    var track = manager.tracks[id];
    var object = this.addPointCloud({color: track.color});
    this.trackObjects[id] = object;
  }
};

VideoRenderer.prototype.init = function() {
  this.width = window.innerWidth;
  this.height = window.innerHeight;

  var viewAngle = 45;
  var aspect = this.width/this.height;
  var near = 0.1;
  var far = 10000;

  // Create the three.js scene.
  var scene = new THREE.Scene();

  // Create a WebGL renderer.
  var renderer = new THREE.WebGLRenderer();
  renderer.setSize(this.width, this.height);

  // Create a camera.
  var camera = new THREE.PerspectiveCamera(viewAngle, aspect, near, far);

  // Apply VR headset positional data to camera.
  var controls = new THREE.VRControls(camera);

  // Apply VR stereo rendering to renderer
  var effect = new THREE.VREffect(renderer);
  effect.setSize(window.innerWidth, window.innerHeight);

  this.vr = new VRManager(effect);

  if (this.overview) {
    // Make it look down on the origin from the +y axis.
    camera.position.set(0, 500, 0);
    camera.up = new THREE.Vector3(0, 0, -1);
    camera.lookAt(new THREE.Vector3(0, 0, 0));
  }

  // Add the camera to the scene.
  scene.add(camera);

  // Set the background color of the scene.
  renderer.setClearColor(0x000000, 1);

  // Attach the renderer to the DOM.
  this.container.appendChild(renderer.domElement);

  // Handle window resizes
  window.addEventListener('resize', this.onWindowResize.bind(this), false);

  // Save the important variables for later calls.
  this.scene = scene;
  this.camera = camera;
  this.renderer = renderer;
  this.effect = effect;
  this.controls = controls;
};

VideoRenderer.prototype.addLight = function() {
  // create a point light
  var pointLight = new THREE.PointLight(0xFFFFFF);

  // set its position
  pointLight.position.x = 10;
  pointLight.position.y = 50;
  pointLight.position.z = 130;

  // add to the scene
  this.scene.add(pointLight);
};

VideoRenderer.prototype.addPointCloud = function(params) {
  params = params || {};
  var color = params.color || 0x333333;
  // Create the particle variables.
  var particleCount = 50;
  var particles = new THREE.Geometry();
  var pMaterial = new THREE.PointCloudMaterial({
    color: color,
    size: 5,
    blending: THREE.AdditiveBlending,
  });

  // Now create the individual particles.
  for (var i = 0; i < particleCount; i++) {

    // Create a bunch of particles randomly on the surface of a sphere.
    var particle = new THREE.Vector3();

    // Give this particle a custom rotation quaternion.
    particle.rotation = Util.randomQuaternion();
    // Generate a random period for the particle.
    particle.period = Util.randomBetween(2000, 5000);

    // Add particle to the geometry.
    particles.vertices.push(particle);
  }

  // create the particle system
  var cloud = new THREE.PointCloud(particles, pMaterial);
  cloud.sortParticles = true;

  // add it to the scene
  this.scene.add(cloud);
  return cloud;
};

VideoRenderer.prototype.addSphere = function(color) {
  var radius = 50;
  var segments = 16;
  var rings = 16;

  var sphereGeometry = new THREE.SphereGeometry( radius, segments, rings);
  var sphereMaterial = new THREE.MeshLambertMaterial({color: color});
  var sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);

  this.scene.add(sphere);
  return sphere;
};

// Largely from http://learningthreejs.com/blog/2011/08/15/lets-do-a-sky/
VideoRenderer.prototype.addSkybox = function() {
  // Load the cube textures.
  //var prefix = 'img/';
  var prefix = 'img/space/';
  var urls = ['posx.png', 'negx.png', 'posy.png', 'negy.png', 'posz.png', 'negz.png'];
  for (var i = 0; i < urls.length; i++) {
    urls[i] = prefix + urls[i];
  }
  var cubemap = THREE.ImageUtils.loadTextureCube(urls);
  cubemap.format = THREE.RGBFormat;

  // Initialize the shader.
  var shader = THREE.ShaderLib['cube'];
  shader.uniforms['tCube'].value = cubemap

  var material = new THREE.ShaderMaterial({
    fragmentShader: shader.fragmentShader,
    vertexShader: shader.vertexShader,
    uniforms: shader.uniforms,
    depthWrite: false,
    side: THREE.BackSide
  });

  // Build the skybox Mesh.
  var skybox = new THREE.Mesh(new THREE.CubeGeometry(1000, 1000, 1000), material);
  // Add it to the scene
  this.scene.add(skybox);
  return skybox;
};

VideoRenderer.prototype.animatePointCloud = function(id, cloud) {
  var track = this.manager.tracks[id];
  var RADIUS = 100;
  var radius = track.amplitude * RADIUS;
  var now = new Date();
  var vertices = cloud.geometry.vertices;
  for (var i = 0; i < vertices.length; i++) {
    var particle = vertices[i];
    var time = (now - this.referenceTime) % particle.period;
    var percent = time / particle.period;
    var angle = percent * Math.PI * 2;
    // Generate a position on a 2D circle.
    particle.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    // Apply a quaternion to place the particle on the right orbit.
    particle.applyQuaternion(particle.rotation);
  }
  cloud.geometry.verticesNeedUpdate = true;
};

VideoRenderer.prototype.onWindowResize = function() {
  this.width = window.innerWidth;
  this.height = window.innerHeight;

  this.camera.aspect = this.width / this.height;
  this.camera.updateProjectionMatrix();

  this.effect.setSize(this.width, this.height);
};


VideoRenderer.prototype.render = function() {
  // Update VR headset position and apply to camera.
  this.controls.update();

  // Update all of the objects in the scene based on the manager's state.
  for (var id in this.manager.tracks) {
    var track = this.manager.tracks[id];

    // Check that the track object is present.
    var trackObject = this.trackObjects[id];
    if (!trackObject) {
      return console.error('No track object found for id: %s.', id);
    }
    trackObject.position.set(track.position[0], track.position[1], track.position[2]);

    // Also, update the particle system based on the track's intensity.
    this.animatePointCloud(id, trackObject);
  }

  if (this.vr.isVRMode()) {
    this.effect.render(this.scene, this.camera);
  } else {
    this.renderer.render(this.scene, this.camera);
  }
};