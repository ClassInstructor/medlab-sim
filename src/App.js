import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import * as Tone from "tone"; // For sound effects

// Helper: Generate simple sound using Tone.js
const playSound = (type = "click") => {
  if (!window.ToneStarted) {
    Tone.start();
    window.ToneStarted = true;
  }
  let synth = new Tone.Synth().toDestination();
  if (type === "click") synth.triggerAttackRelease("C6", "8n", undefined, 0.2);
  else if (type === "success") synth.triggerAttackRelease("E6", "16n", undefined, 0.6);
  else if (type === "error") synth.triggerAttackRelease("C4", "16n", undefined, 0.4);
  else if (type === "pour") synth.triggerAttackRelease("A5", "16n", undefined, 0.2);
  else if (type === "beep") synth.triggerAttackRelease("G5", "32n", undefined, 0.7);
};

const PROCEDURE = [
  {
    id: 0,
    title: "Wear Lab Coat and Safety Goggles",
    instruction: "Put on your lab coat and safety goggles before handling any equipment.",
    validate: (state) => state.wearingLabCoat && state.wearingGoggles,
    error: "You must wear your lab coat and goggles first.",
  },
  {
    id: 1,
    title: "Calibrate Analytical Balance",
    instruction: "Click the balance to calibrate (zero) it before weighing any objects.",
    validate: (state) => state.balanceCalibrated,
    error: "Calibrate the analytical balance first by clicking it.",
  },
  {
    id: 2,
    title: "Measure 50ml of Water",
    instruction:
      "Pick up the graduated cylinder, drag it to the sink, and fill to the 50ml mark. Then move it to the bench.",
    validate: (state) => state.cylinderFilled && state.cylinderAtBench,
    error:
      "You must use the graduated cylinder to measure water, fill it at the sink, and place it on the bench.",
  },
  {
    id: 3,
    title: "Weigh the Filled Cylinder",
    instruction:
      "Drag the filled graduated cylinder to the analytical balance to weigh it. Read the display.",
    validate: (state) => state.cylinderWeighed,
    error: "Weigh the filled graduated cylinder on the analytical balance.",
  },
  {
    id: 4,
    title: "Dispose of Waste Properly",
    instruction:
      "Dispose of any chemical waste in the correct waste bin before finishing.",
    validate: (state) => state.wasteDisposed,
    error: "Dispose of chemical waste before completing the procedure.",
  },
];

export default function App() {
  // ========== State Management ==========
  const mountRef = useRef();
  const [simState, setSimState] = useState({
    wearingLabCoat: false,
    wearingGoggles: false,
    balanceCalibrated: false,
    cylinderPicked: false,
    cylinderFilled: false,
    cylinderAtBench: false,
    cylinderWeighed: false,
    wasteDisposed: false,
    dragging: null,
    dragOffset: new THREE.Vector3(),
    selectedObj: null,
  });
  const [currentStep, setCurrentStep] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [showModal, setShowModal] = useState(false);

  // 3D object refs and scene state
  const threeRefs = useRef({
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    raycaster: null,
    intersects: [],
    objects: {},
    mouse: new THREE.Vector2(),
    draggingObj: null,
    dragOffset: new THREE.Vector3(),
    dragPlane: new THREE.Plane(),
    pointerDown: false,
    lastPointer: [0, 0],
    canvasRect: null,
  });

  // ========== React Effect: Initialize Three.js ==========
  useEffect(() => {
    const mountNode = mountRef.current; // FIX: For ref warning
    let width = mountNode.clientWidth;
    let height = mountNode.clientHeight;

    // --- Create Renderer ---
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0xff0000); // bright red for testing

    renderer.setSize(width, height);
    mountNode.appendChild(renderer.domElement);

    // --- Scene, Camera ---
    // eslint-disable-next-line no-unused-vars
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(3.5, 2.3, 4.5);
    camera.lookAt(0, 1, 0);

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(5, 8, 6);
    scene.add(dirLight);

    // --- Orbit Controls ---
    // eslint-disable-next-line no-unused-vars
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = 3.2;
    controls.maxDistance = 8;
    controls.maxPolarAngle = Math.PI / 2.2;
    controls.dampingFactor = 0.13;

    // --- Raycaster for object selection ---
    const raycaster = new THREE.Raycaster();

    // --- Lab Room ---
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 7),
      new THREE.MeshLambertMaterial({ color: 0xe0e5ee })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);

    // Walls (three simple)
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xdbe8ee });
    ["left", "right", "back"].forEach((dir) => {
      const wall = new THREE.Mesh(
        new THREE.PlaneGeometry(
          dir === "back" ? 9 : 7,
          2.8
        ),
        wallMat
      );
      if (dir === "left") {
        wall.rotation.y = Math.PI / 2;
        wall.position.set(-4.5, 1.4, 0);
      } else if (dir === "right") {
        wall.rotation.y = -Math.PI / 2;
        wall.position.set(4.5, 1.4, 0);
      } else if (dir === "back") {
        wall.position.set(0, 1.4, -3.5);
      }
      scene.add(wall);
    });

    // --- Lab Benches ---
    function addBench(id, x, z, w = 2.4, h = 0.9, d = 0.7, color = 0xc9d5e5) {
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.08, d),
        new THREE.MeshLambertMaterial({ color })
      );
      bench.position.set(x, h, z);
      scene.add(bench);
      threeRefs.current.objects[id] = bench;
    }
    addBench("bench_main", 0, 0.6, 2.4, 0.87, 0.72);
    addBench("bench_side", 2.7, -1, 1.8, 0.88, 0.6);

    // --- Sink ---
    const sink = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.11, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x9fc9dd })
    );
    sink.position.set(-2.2, 0.93, -1.5);
    scene.add(sink);
    threeRefs.current.objects["sink"] = sink;

    // Sink faucet
    const faucet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.27, 16),
      new THREE.MeshLambertMaterial({ color: 0x888c94 })
    );
    faucet.position.set(-2.2, 1.1, -1.65);
    scene.add(faucet);

    // --- Analytical Balance ---
    const balance = new THREE.Group();
    const balanceBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.07, 0.23),
      new THREE.MeshLambertMaterial({ color: 0x757a7e })
    );
    const balancePlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.012, 32),
      new THREE.MeshLambertMaterial({ color: 0xe4e6ea })
    );
    balancePlate.position.set(0, 0.048, 0.02);
    balance.add(balanceBase);
    balance.add(balancePlate);
    balance.position.set(1.08, 0.94, 0.22);
    balance.name = "balance";
    scene.add(balance);
    threeRefs.current.objects["balance"] = balance;

    // --- Graduated Cylinder (Draggable) ---
    const cylinder = new THREE.Group();
    const cylBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.048, 0.29, 24),
      new THREE.MeshPhongMaterial({ color: 0xcbe0fa, transparent: true, opacity: 0.56 })
    );
    const cylBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16),
      new THREE.MeshPhongMaterial({ color: 0xcccccc })
    );
    cylBase.position.set(0, -0.145, 0);
    cylinder.add(cylBody);
    cylinder.add(cylBase);
    cylinder.position.set(-1.1, 0.98, 0.32);
    cylinder.name = "cylinder";
    scene.add(cylinder);
    threeRefs.current.objects["cylinder"] = cylinder;

    // --- Beaker (not used in this demo) ---
    const beaker = new THREE.Group();
    const beakerBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.064, 0.13, 24, 1, true),
      new THREE.MeshPhongMaterial({ color: 0xf7f6fa, transparent: true, opacity: 0.52 })
    );
    const beakerBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.063, 0.063, 0.018, 16),
      new THREE.MeshPhongMaterial({ color: 0xf7f6fa })
    );
    beakerBase.position.set(0, -0.056, 0);
    beaker.add(beakerBody);
    beaker.add(beakerBase);
    beaker.position.set(-0.75, 0.98, -0.1);
    beaker.name = "beaker";
    scene.add(beaker);
    threeRefs.current.objects["beaker"] = beaker;

    // --- Pipette ---
    const pipette = new THREE.Group();
    const pipBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.012, 0.17, 16),
      new THREE.MeshLambertMaterial({ color: 0xe6dcd1 })
    );
    pipBody.position.set(0, 0, 0);
    const pipTip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.007, 0.03, 12),
      new THREE.MeshLambertMaterial({ color: 0xcccccc })
    );
    pipTip.position.set(0, -0.1, 0);
    pipette.add(pipBody);
    pipette.add(pipTip);
    pipette.position.set(-0.5, 1.01, 0.25);
    pipette.name = "pipette";
    scene.add(pipette);
    threeRefs.current.objects["pipette"] = pipette;

    // --- Waste Bin ---
    const bin = new THREE.Group();
    const binBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.11, 0.28, 24, 1, true),
      new THREE.MeshPhongMaterial({ color: 0x2b2e39 })
    );
    const binBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.018, 20),
      new THREE.MeshPhongMaterial({ color: 0x4a505c })
    );
    binBase.position.set(0, -0.13, 0);
    bin.add(binBody);
    bin.add(binBase);
    bin.position.set(2.35, 0.97, 0.49);
    bin.name = "wastebin";
    scene.add(bin);
    threeRefs.current.objects["wastebin"] = bin;

    // --- Resize Handler ---
    const onWindowResize = () => {
      let width = mountNode.clientWidth;
      let height = mountNode.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onWindowResize, false);

    // --- Store refs ---
    threeRefs.current = {
      ...threeRefs.current,
      renderer,
      scene,
      camera,
      controls,
      raycaster,
      objects: threeRefs.current.objects,
      mouse: new THREE.Vector2(),
    };

    // --- Render Loop ---
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    // --- Clean up on Unmount ---
    return () => {
      renderer.dispose();
      window.removeEventListener("resize", onWindowResize);
      if (mountNode && renderer.domElement.parentNode === mountNode) {
        mountNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  // ========== React Effect: 3D Mouse & Touch Interactions ==========
  useEffect(() => {
    const { renderer, camera, scene, controls, raycaster, objects } = threeRefs.current;
    if (!renderer || !camera) return;

    let draggingObj = null;

    function getPointerCoords(e) {
      let rect = renderer.domElement.getBoundingClientRect();
      let x, y;
      if (e.touches) {
        x = ((e.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
        y = -((e.touches[0].clientY - rect.top) / rect.height) * 2 + 1;
      } else {
        x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      }
      return [x, y];
    }

    function onPointerDown(e) {
      e.preventDefault();
      if (simState.dragging) return;

      let [mx, my] = getPointerCoords(e);
      threeRefs.current.mouse.set(mx, my);

      raycaster.setFromCamera(threeRefs.current.mouse, camera);

      const intersectList = [objects["cylinder"], objects["pipette"]];
      let intersects = raycaster.intersectObjects(
        intersectList.map((obj) => obj),
        true
      );
      if (intersects.length > 0) {
        let pickedObj =
          intersects[0].object.parent.type === "Group"
            ? intersects[0].object.parent
            : intersects[0].object;

        if (
          (pickedObj.name === "cylinder" &&
            (currentStep === 2 || currentStep === 3)) ||
          (pickedObj.name === "pipette" && currentStep === 2)
        ) {
          draggingObj = pickedObj.name;
          setSimState((s) => ({ ...s, dragging: draggingObj }));
          playSound("click");
        }
      }
      threeRefs.current.pointerDown = true;
    }

    function onPointerMove(e) {
      if (!simState.dragging) return;
      e.preventDefault();
      let [mx, my] = getPointerCoords(e);
      threeRefs.current.mouse.set(mx, my);

      raycaster.setFromCamera(threeRefs.current.mouse, camera);
      let planeY = 0.98;

      let vector = new THREE.Vector3();
      raycaster.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY),
        vector
      );

      let obj = objects[simState.dragging];
      if (obj) {
        obj.position.x = vector.x;
        obj.position.z = vector.z;
        obj.position.y = planeY;
      }
    }

    function onPointerUp(e) {
      if (!simState.dragging) return;
      e.preventDefault();

      let obj = objects[simState.dragging];
      if (!obj) {
        setSimState((s) => ({ ...s, dragging: null }));
        return;
      }

      if (simState.dragging === "cylinder") {
        let distToSink = obj.position.distanceTo(objects["sink"].position);
        if (distToSink < 0.55 && !simState.cylinderFilled) {
          setSimState((s) => ({
            ...s,
            cylinderFilled: true,
          }));
          setFeedback("Cylinder filled with 50ml of water!");
          playSound("pour");
        }
        let benchPos = objects["bench_main"].position;
        let benchDist = Math.abs(obj.position.x - benchPos.x) < 1 && Math.abs(obj.position.z - benchPos.z) < 0.7;
        if (simState.cylinderFilled && benchDist) {
          setSimState((s) => ({
            ...s,
            cylinderAtBench: true,
          }));
          setFeedback("Cylinder placed on the bench.");
          playSound("success");
        }
        let distToBalance = obj.position.distanceTo(objects["balance"].position);
        if (simState.cylinderFilled && distToBalance < 0.38) {
          setSimState((s) => ({
            ...s,
            cylinderWeighed: true,
          }));
          setFeedback("Cylinder weighed! Display: 53.4g");
          playSound("beep");
        }
        let distToBin = obj.position.distanceTo(objects["wastebin"].position);
        if (distToBin < 0.33 && simState.cylinderFilled) {
          setSimState((s) => ({
            ...s,
            wasteDisposed: true,
            cylinderFilled: false,
            cylinderAtBench: false,
            cylinderWeighed: false,
          }));
          setFeedback("Waste properly disposed!");
          playSound("success");
          obj.position.set(-1.1, 0.98, 0.32);
        }
      }
      if (simState.dragging === "pipette") {
        setFeedback("Pipette interaction is not required in this step.");
      }

      setSimState((s) => ({ ...s, dragging: null }));
      threeRefs.current.pointerDown = false;
    }

    function onBalanceClick(e) {
      if (!threeRefs.current.renderer) return;
      let rect = threeRefs.current.renderer.domElement.getBoundingClientRect();
      let mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      let my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      threeRefs.current.mouse.set(mx, my);

      threeRefs.current.raycaster.setFromCamera(
        threeRefs.current.mouse,
        threeRefs.current.camera
      );
      let intersects = threeRefs.current.raycaster.intersectObject(
        threeRefs.current.objects["balance"],
        true
      );
      if (intersects.length > 0) {
        if (currentStep === 1 && !simState.balanceCalibrated) {
          setSimState((s) => ({ ...s, balanceCalibrated: true }));
          setFeedback("Balance calibrated (zeroed)!");
          playSound("beep");
        } else if (simState.cylinderFilled && currentStep === 3) {
          setSimState((s) => ({ ...s, cylinderWeighed: true }));
          setFeedback("Cylinder weighed! Display: 53.4g");
          playSound("beep");
        }
      }
    }

    const canvas = renderer.domElement;
    canvas.addEventListener("mousedown", onPointerDown);
    canvas.addEventListener("mousemove", onPointerMove);
    canvas.addEventListener("mouseup", onPointerUp);
    canvas.addEventListener("touchstart", onPointerDown, { passive: false });
    canvas.addEventListener("touchmove", onPointerMove, { passive: false });
    canvas.addEventListener("touchend", onPointerUp, { passive: false });
    canvas.addEventListener("click", onBalanceClick);

    return () => {
      canvas.removeEventListener("mousedown", onPointerDown);
      canvas.removeEventListener("mousemove", onPointerMove);
      canvas.removeEventListener("mouseup", onPointerUp);
      canvas.removeEventListener("touchstart", onPointerDown);
      canvas.removeEventListener("touchmove", onPointerMove);
      canvas.removeEventListener("touchend", onPointerUp);
      canvas.removeEventListener("click", onBalanceClick);
    };
    // eslint-disable-next-line
  }, [simState, currentStep]);

  // ========== React Effect: Step Progression & Validation ==========
  useEffect(() => {
    let curStep = PROCEDURE[currentStep];
    if (curStep.validate(simState)) {
      setTimeout(() => {
        if (currentStep < PROCEDURE.length - 1) {
          setCurrentStep((n) => n + 1);
          setFeedback("");
        } else {
          setFeedback("Congratulations! You have completed all safety & handling steps.");
          setShowModal(true);
        }
      }, 850);
    }
    // eslint-disable-next-line
  }, [simState]);

  // ========== Handlers for Lab Coat & Goggles ==========
  const handleWearLabCoat = () => {
    if (!simState.wearingLabCoat) {
      setSimState((s) => ({ ...s, wearingLabCoat: true }));
      setFeedback("Lab coat worn.");
      playSound("click");
    }
  };
  const handleWearGoggles = () => {
    if (!simState.wearingGoggles) {
      setSimState((s) => ({ ...s, wearingGoggles: true }));
      setFeedback("Safety goggles worn.");
      playSound("click");
    }
  };

  // ========== Render UI ==========

  const stepPct = ((currentStep + 1) / PROCEDURE.length) * 100;

  return (
    <div className="relative w-screen h-screen flex flex-col overflow-hidden bg-blue-50">
      {/* --- Top Progress Bar and Title --- */}
      <div className="absolute z-30 w-full top-0 left-0 px-2 pt-3 flex flex-col md:flex-row items-center">
        <div className="w-full md:w-1/2 max-w-xl mx-auto">
          <div className="text-lg font-bold tracking-wide text-blue-900">
            Virtual Medical Laboratory Simulation
          </div>
          <div className="w-full h-3 bg-blue-200 rounded-lg my-1">
            <div
              className="h-3 bg-blue-600 rounded-lg transition-all"
              style={{ width: `${stepPct}%` }}
            />
          </div>
          <div className="text-sm text-blue-900">
            Step {currentStep + 1} of {PROCEDURE.length}:{" "}
            <span className="font-medium">{PROCEDURE[currentStep].title}</span>
          </div>
        </div>
      </div>
      {/* --- Main 3D Canvas --- */}
      <div
        ref={mountRef}
        className="absolute top-0 left-0 w-full h-full bg-blue-50"
        style={{ touchAction: "none", zIndex: 10 }}
      ></div>

      {/* --- UI Overlay Panel: Step Instructions & Interactives --- */}
      <div className="absolute top-20 left-0 md:left-8 w-full md:w-[24rem] p-4 bg-white bg-opacity-80 rounded-2xl shadow-xl z-40">
        <div className="flex gap-2 items-center mb-2">
          {/* Lab Coat */}
          <button
            onClick={handleWearLabCoat}
            className={`rounded-full border-2 ${
              simState.wearingLabCoat
                ? "border-green-500 bg-green-100"
                : "border-blue-500"
            } px-2 py-1 font-medium text-blue-900 text-xs transition-colors`}
            disabled={simState.wearingLabCoat}
          >
            {simState.wearingLabCoat ? "Lab Coat Worn" : "Wear Lab Coat"}
          </button>
          {/* Goggles */}
          <button
            onClick={handleWearGoggles}
            className={`rounded-full border-2 ${
              simState.wearingGoggles
                ? "border-green-500 bg-green-100"
                : "border-blue-500"
            } px-2 py-1 font-medium text-blue-900 text-xs transition-colors`}
            disabled={simState.wearingGoggles}
          >
            {simState.wearingGoggles ? "Goggles Worn" : "Wear Goggles"}
          </button>
        </div>
        <div className="mb-2 text-blue-900 font-semibold text-base">
          {PROCEDURE[currentStep].instruction}
        </div>
        {/* Feedback */}
        {feedback && (
          <div
            className={`mb-2 px-3 py-2 rounded-xl font-medium ${
              feedback.includes("Incorrect")
                ? "bg-red-100 text-red-600"
                : "bg-green-100 text-green-800"
            } transition-all`}
          >
            {feedback}
          </div>
        )}
        {/* Error if trying to proceed without completing step */}
        {!PROCEDURE[currentStep].validate(simState) && (
          <div className="text-xs text-red-500">
            {PROCEDURE[currentStep].error}
          </div>
        )}
        {/* Progress/Status */}
        <div className="mt-3 flex gap-2 text-xs text-blue-800 flex-wrap">
          <div>
            <span
              className={`w-2 h-2 rounded-full inline-block mr-1 ${
                simState.wearingLabCoat ? "bg-green-500" : "bg-blue-300"
              }`}
            ></span>
            Lab Coat
          </div>
          <div>
            <span
              className={`w-2 h-2 rounded-full inline-block mr-1 ${
                simState.wearingGoggles ? "bg-green-500" : "bg-blue-300"
              }`}
            ></span>
            Goggles
          </div>
          <div>
            <span
              className={`w-2 h-2 rounded-full inline-block mr-1 ${
                simState.balanceCalibrated ? "bg-green-500" : "bg-blue-300"
              }`}
            ></span>
            Balance Calibrated
          </div>
          <div>
            <span
              className={`w-2 h-2 rounded-full inline-block mr-1 ${
                simState.cylinderFilled ? "bg-green-500" : "bg-blue-300"
              }`}
            ></span>
            Cylinder Filled
          </div>
          <div>
            <span
              className={`w-2 h-2 rounded-full inline-block mr-1 ${
                simState.cylinderWeighed ? "bg-green-500" : "bg-blue-300"
              }`}
            ></span>
            Cylinder Weighed
          </div>
          <div>
            <span
              className={`w-2 h-2 rounded-full inline-block mr-1 ${
                simState.wasteDisposed ? "bg-green-500" : "bg-blue-300"
              }`}
            ></span>
            Waste Disposed
          </div>
        </div>
      </div>

      {/* --- Completion Modal --- */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl px-7 py-8 max-w-xs w-full flex flex-col items-center animate-fadein">
            <div className="text-2xl font-bold text-green-700 mb-2">
              Procedure Complete!
            </div>
            <div className="mb-2 text-gray-700">
              You have successfully finished all safety & equipment handling steps.
            </div>
            <button
              className="mt-4 px-6 py-2 rounded-lg bg-blue-700 text-white font-semibold shadow hover:bg-blue-800 transition"
              onClick={() => setShowModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* --- Responsive note (mobile users) --- */}
      <div className="absolute right-3 bottom-3 z-40">
        <div className="text-xs bg-white bg-opacity-80 rounded-lg px-3 py-1 shadow text-blue-900">
          {window.innerWidth < 640
            ? "Tip: Pinch & drag to explore the 3D lab. Tap objects to interact."
            : "Tip: Use mouse to rotate/zoom. Drag objects for lab tasks."}
        </div>
      </div>
    </div>
  );
}

/*
===============================================================================
NOTES ON ARCHITECTURE & NEXT STEPS FOR EXPANSION
===============================================================================

- 3D objects are basic Three.js primitives for fast load and clarity; 
  replace with detailed models for realism as needed.
- Object picking and drag-n-drop is handled using Three.js raycasting.
- State management uses React; for multiple modules, consider splitting out logic.
- Procedure logic (validation, step progression) is data-driven (see PROCEDURE array).
- Sound effects: Simple chimes/clicks with Tone.js (no external assets).
- For additional equipment/interactions: expand the PROCEDURE array and implement logic in handlers.
- For avatars/avatars with worn gear, add a humanoid mesh and update its material/state.
- For fume hood, eyewash, add similar models and procedure steps.
- For more immersive UI, add "hotspot" highlights or glowing effects to correct objects on each step.

===============================================================================
*/
