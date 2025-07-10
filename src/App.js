import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as Tone from 'tone'; // For sound effects

// Main App Component for the Medical Lab Simulation
function App() {
  // State for simulation logic
  const [currentStep, setCurrentStep] = useState(0);
  const [score, setScore] = useState(0);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isCorrectAction, setIsCorrectAction] = useState(null); // true, false, or null
  const [activeTool, setActiveTool] = useState(null); // Tool currently "held" for drag-and-drop
  const [bloodDropVisible, setBloodDropVisible] = useState(false);
  const [slideHasBlood, setSlideHasBlood] = useState(false);
  const [smearQuality, setSmearQuality] = useState(null); // null, 'good', 'too_thick', 'too_thin'
  const [showMicroscopeView, setShowMicroscopeView] = useState(false);

  // Refs for interactive areas/elements
  const fingerRef = useRef(null);
  const slideRef = useRef(null);
  const spreaderSlideRef = useRef(null);
  const smearCanvasRef = useRef(null);
  const microscopeViewCanvasRef = useRef(null);

  // Sound effects setup
  const clickSynth = useRef(null);
  const successSynth = useRef(null);
  const errorSynth = useRef(null);
  const dropSound = useRef(null);
  const swabSound = useRef(null);

  useEffect(() => {
    // Initialize Tone.js synths with cooler sounds
    clickSynth.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.05, release: 0.1 },
      volume: -10
    }).toDestination(); // Soft, quick click

    successSynth.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.5 },
      volume: -8
    }).toDestination(); // Gentle chime

    errorSynth.current = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.01, release: 0.2 },
      volume: -15
    }).toDestination(); // Subtle, low buzz

    dropSound.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.01, release: 0.2 },
      volume: -12
    }).toDestination(); // Liquid plink

    swabSound.current = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 },
      volume: -25
    }).toDestination(); // Very subtle swab sound

    // Cleanup on unmount
    return () => {
      clickSynth.current?.dispose();
      successSynth.current?.dispose();
      errorSynth.current?.dispose();
      dropSound.current?.dispose();
      swabSound.current?.dispose();
    };
  }, []);

  const playClickSound = useCallback(() => {
    if (clickSynth.current) {
      clickSynth.current.triggerAttackRelease('C5', '8n');
    }
  }, []);

  const playSuccessSound = useCallback(() => {
    if (successSynth.current) {
      successSynth.current.triggerAttackRelease(['G4', 'C5', 'E5'], '8n'); // Ascending chime
    }
  }, []);

  const playErrorSound = useCallback(() => {
    if (errorSynth.current) {
      errorSynth.current.triggerAttackRelease('C2', '8n'); // Low thud
    }
  }, []);

  const playDropSound = useCallback(() => {
    if (dropSound.current) {
      dropSound.current.triggerAttackRelease('G3', '8n');
    }
  }, []);

  const playSwabSound = useCallback(() => {
    if (swabSound.current) {
      swabSound.current.triggerAttackRelease('16n');
    }
  }, []);

  // Define the lab procedure steps for Blood Smear Preparation
  const labProcedureSteps = [
    {
      id: 'intro',
      instruction: 'Welcome to the Virtual Lab! Today, we will learn how to prepare a blood smear. Click "Start Simulation" to begin.',
      action: null,
      target: null,
      nextStep: 'gather_equipment',
    },
    {
      id: 'gather_equipment',
      instruction: 'Step 1: Gather necessary equipment. Click on the Alcohol Swab to pick it up.',
      action: 'pick_up_tool',
      target: 'alcohol_swab',
      nextStep: 'clean_finger',
    },
    {
      id: 'clean_finger',
      instruction: 'Step 2: Clean the patient\'s finger. Drag the Alcohol Swab to the finger icon.',
      action: 'use_tool_on_target',
      tool: 'alcohol_swab',
      target: 'finger',
      nextStep: 'prick_finger',
    },
    {
      id: 'prick_finger',
      instruction: 'Step 3: Prick the finger. Click on the Lancet to pick it up.',
      action: 'pick_up_tool',
      target: 'lancet',
      nextStep: 'apply_lancet',
    },
    {
      id: 'apply_lancet',
      instruction: 'Step 4: Apply the lancet to the finger. Drag the Lancet to the finger icon to simulate pricking.',
      action: 'use_tool_on_target',
      tool: 'lancet',
      target: 'finger',
      nextStep: 'wipe_first_drop',
    },
    {
      id: 'wipe_first_drop',
      instruction: 'Step 5: Wipe away the first drop of blood. Click on the Alcohol Swab to pick it up.',
      action: 'pick_up_tool',
      target: 'alcohol_swab',
      nextStep: 'wipe_blood',
    },
    {
      id: 'wipe_blood',
      instruction: 'Step 6: Drag the Alcohol Swab to the blood drop icon to wipe it away.',
      action: 'use_tool_on_target',
      tool: 'alcohol_swab',
      target: 'blood_drop',
      nextStep: 'wait_for_second_drop', // NEW STEP ADDED HERE
    },
    {
      id: 'wait_for_second_drop',
      instruction: 'Step 7: A second blood drop is forming. Please wait...',
      action: 'auto_advance_blood_drop', // Custom action for auto-progression and state change
      target: null,
      nextStep: 'collect_second_drop',
    },
    {
      id: 'collect_second_drop',
      instruction: 'Step 8: Collect the second drop of blood onto a clean glass slide. Click on the Clean Slide to pick it up.',
      action: 'pick_up_tool',
      target: 'clean_slide',
      nextStep: 'collect_blood_on_slide',
    },
    {
      id: 'collect_blood_on_slide',
      instruction: 'Step 9: Drag the Clean Slide to the blood drop icon to collect the sample.',
      action: 'use_tool_on_target',
      tool: 'clean_slide',
      target: 'blood_drop',
      nextStep: 'prepare_smear',
    },
    {
      id: 'prepare_smear',
      instruction: 'Step 10: Prepare the blood smear. Click on the Spreader Slide to pick it up.',
      action: 'pick_up_tool',
      target: 'spreader_slide',
      nextStep: 'perform_smear',
    },
    {
      id: 'perform_smear',
      instruction: 'Step 11: With the Spreader Slide active, click the "Create Smear" button to prepare the blood smear.',
      action: 'click_create_smear', // Action is now a simple click
      target: 'create_smear_button', // Target is the button itself
      nextStep: 'air_dry',
    },
    {
      id: 'air_dry',
      instruction: 'Step 12: Allow the blood smear to air dry completely. (Click "Next" when ready).',
      action: 'next_step_button',
      target: 'next_button',
      nextStep: 'microscope_observation',
    },
    {
      id: 'microscope_observation',
      instruction: 'Step 13: Observe the prepared smear under the microscope. Evaluate its quality.',
      action: 'view_microscope',
      target: 'microscope_icon',
      nextStep: 'procedure_complete',
    },
    {
      id: 'procedure_complete',
      instruction: 'Procedure Complete! You have successfully completed the Blood Smear Preparation simulation. Now, watch a real-life demonstration.',
      action: 'next_step_button',
      target: 'next_button',
      nextStep: 'video_demonstration', // Transition to video
    },
    {
      id: 'video_demonstration',
      instruction: 'Watch this video demonstrating the blood smear preparation process. Click "Next" when done.',
      action: 'next_step_button',
      target: 'next_button',
      nextStep: 'mcq_challenge', // Transition to MCQ
    },
    {
      id: 'mcq_challenge',
      instruction: 'Test your knowledge! Answer the question below based on what you\'ve learned and observed.',
      action: 'mcq_handled_internally', // This action is handled by MCQChallenge component directly
      target: null, // No specific target for main App to handle
      nextStep: 'final_completion', // Transition to final completion
    },
    {
      id: 'final_completion',
      instruction: 'Congratulations! You have completed the entire module.',
      action: null,
      target: null,
      nextStep: null,
    }
  ];

  // --- Utility Functions for Drawing on Canvas (for Smear and Microscope View) ---
  const drawSmear = useCallback((quality) => {
    const canvas = smearCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear previous smear

    const width = canvas.width;
    const height = canvas.height;

    // Draw the base slide
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, width, height);

    // Draw the blood smear based on quality
    ctx.fillStyle = 'rgba(139, 0, 0, 0.7)'; // Dark red for blood

    if (quality === 'good') {
      // Good smear: feathered edge, even thickness
      ctx.beginPath();
      ctx.moveTo(width * 0.1, height * 0.9);
      ctx.bezierCurveTo(width * 0.3, height * 0.7, width * 0.7, height * 0.3, width * 0.9, height * 0.1);
      ctx.lineTo(width * 0.9, height * 0.9);
      ctx.closePath();
      ctx.fill();

      // Simulate even spread
      for (let i = 0; i < 50; i++) {
        const x = Math.random() * (width * 0.8) + width * 0.1;
        const y = Math.random() * (height * 0.8) + height * 0.1;
        const radius = Math.random() * 2 + 1;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (quality === 'too_thick') {
      // Too thick smear: blobby, uneven
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, width * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '20px Arial';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.fillText('Too Thick!', width / 2, height / 2);
    } else if (quality === 'too_thin') {
      // Too thin smear: sparse, streaky
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(width * 0.1 + i * 10, height * 0.9);
        ctx.lineTo(width * 0.9 + i * 10, height * 0.1);
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.font = '20px Arial';
      ctx.fillStyle = 'black';
      ctx.textAlign = 'center';
      ctx.fillText('Too Thin!', width / 2, height / 2);
    }
  }, []);

  const drawMicroscopeView = useCallback((quality) => {
    const canvas = microscopeViewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const width = canvas.width;
    const height = canvas.height;

    // Draw circular field of view
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, width / 2 - 10, 0, Math.PI * 2);
    ctx.fillStyle = 'black';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Draw cells based on smear quality
    const drawCell = (x, y, radius, color) => {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Nucleus
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200,0,0,0.8)';
      ctx.fill();
    };

    if (quality === 'good') {
      ctx.filter = 'none'; // Clear any blur/filter
      for (let i = 0; i < 30; i++) {
        const x = Math.random() * width * 0.8 + width * 0.1;
        const y = Math.random() * height * 0.8 + height * 0.1;
        const radius = Math.random() * 5 + 8; // Varied cell sizes
        drawCell(x, y, radius, 'rgba(255, 100, 100, 0.8)'); // Red blood cells
      }
      ctx.font = '24px Inter';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.fillText('Good Smear!', width / 2, height - 30);
    } else if (quality === 'too_thick') {
      ctx.filter = 'blur(3px)';
      for (let i = 0; i < 100; i++) { // Many overlapping cells
        const x = Math.random() * width * 0.8 + width * 0.1;
        const y = Math.random() * height * 0.8 + height * 0.1;
        const radius = Math.random() * 8 + 10;
        drawCell(x, y, radius, 'rgba(255, 50, 50, 0.5)');
      }
      ctx.font = '24px Inter';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.fillText('Too Thick Smear!', width / 2, height - 30);
    } else if (quality === 'too_thin') {
      ctx.filter = 'blur(1px)';
      for (let i = 0; i < 5; i++) { // Few cells
        const x = Math.random() * width * 0.8 + width * 0.1;
        const y = Math.random() * height * 0.8 + height * 0.1;
        const radius = Math.random() * 3 + 5;
        drawCell(x, y, radius, 'rgba(255, 150, 150, 0.8)');
      }
      ctx.font = '24px Inter';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.fillText('Too Thin Smear!', width / 2, height - 30);
    } else {
      ctx.font = '24px Inter';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.fillText('No Smear Prepared Yet', width / 2, height / 2);
    }
  }, []);

  useEffect(() => {
    if (showMicroscopeView) {
      drawMicroscopeView(smearQuality);
    }
  }, [showMicroscopeView, smearQuality, drawMicroscopeView]);


  // --- Drag and Drop Logic ---
  const handleDragStart = useCallback((toolId) => (e) => {
    // Clear previous feedback immediately
    setFeedbackMessage('');
    setIsCorrectAction(null);

    console.log(`Drag Start: toolId=${toolId}, currentStep=${currentStep}, activeTool=${activeTool}`);
    // Only allow drag if it's the correct tool for the current step's action
    const currentProcedure = labProcedureSteps[currentStep];
    if (currentProcedure?.tool === toolId && currentProcedure?.action === 'use_tool_on_target') {
        setActiveTool(toolId);
        playClickSound();
        e.dataTransfer.setData("toolId", toolId); // For actual drag-and-drop API
    } else {
        e.preventDefault(); // Prevent dragging if it's not the correct tool/step
        setFeedbackMessage(`Please pick up the correct tool for this step.`);
        setIsCorrectAction(false);
        playErrorSound();
        setTimeout(() => { setFeedbackMessage(''); setIsCorrectAction(null); }, 3000);
    }
  }, [playClickSound, currentStep, activeTool, labProcedureSteps, playErrorSound]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault(); // Necessary to allow dropping
  }, []);

  const handleDrop = useCallback((targetId) => (e) => {
    // Clear previous feedback immediately
    setFeedbackMessage('');
    setIsCorrectAction(null);

    e.preventDefault();
    const toolId = activeTool; // Get the active tool from state, not e.dataTransfer
    console.log(`handleDrop: toolId=${toolId}, targetId=${targetId}, currentStep=${currentStep}, bloodDropVisible=${bloodDropVisible}, slideHasBlood=${slideHasBlood}`);

    if (!toolId) {
      console.log('No active tool to drop.');
      setFeedbackMessage('Please pick up a tool first.');
      setIsCorrectAction(false);
      playErrorSound();
      setTimeout(() => { setFeedbackMessage(''); setIsCorrectAction(null); }, 3000);
      return;
    }

    const currentProcedure = labProcedureSteps[currentStep];
    let newScore = score;
    let message = '';
    let isCorrect = false;
    let proceedToNextStep = false;

    // Validate drop based on current step, active tool, and target
    if (currentProcedure.action === 'use_tool_on_target' && currentProcedure.tool === toolId && currentProcedure.target === targetId) {
        switch (currentProcedure.id) {
            case 'clean_finger':
                message = 'Finger cleaned successfully!';
                playSwabSound();
                isCorrect = true;
                newScore += 10;
                proceedToNextStep = true;
                break;
            case 'apply_lancet':
                message = 'Finger pricked! A blood drop appeared.';
                playDropSound();
                setBloodDropVisible(true);
                isCorrect = true;
                newScore += 20;
                proceedToNextStep = true;
                break;
            case 'wipe_blood':
                if (bloodDropVisible) { // Ensure there's a blood drop to wipe
                    message = 'First blood drop wiped away. Good!';
                    playSwabSound();
                    setBloodDropVisible(false); // Hide the blood drop (temporarily)
                    isCorrect = true;
                    newScore += 10;
                    proceedToNextStep = true;
                } else {
                    message = 'There is no blood drop to wipe yet.';
                    isCorrect = false;
                }
                break;
            case 'collect_blood_on_slide':
                if (bloodDropVisible) { // Ensure there's a blood drop to collect
                    message = 'Blood collected on the slide!';
                    playDropSound();
                    setBloodDropVisible(false); // Blood is now on the slide, not finger
                    setSlideHasBlood(true); // Mark slide as having blood
                    isCorrect = true;
                    newScore += 20;
                    proceedToNextStep = true;
                } else {
                    message = 'There is no blood drop to collect on the slide yet.';
                    isCorrect = false;
                }
                break;
            default:
                message = 'Invalid action for this specific step.';
                isCorrect = false;
                break;
        }
    } else {
        message = `Incorrect action or target for this step.`;
        isCorrect = false;
    }

    setActiveTool(null); // Reset active tool after drop
    setScore(newScore);
    setFeedbackMessage(message);
    setIsCorrectAction(isCorrect);
    if (!isCorrect) playErrorSound();

    if (proceedToNextStep) {
      setTimeout(() => {
        setCurrentStep(prev => {
            console.log(`Transitioning step from ${prev} to ${prev + 1}`);
            return prev + 1;
        });
        setFeedbackMessage('');
        setIsCorrectAction(null);
      }, 1500);
    } else {
      setTimeout(() => {
        setFeedbackMessage('');
        setIsCorrectAction(null);
      }, 3000);
    }
  }, [currentStep, score, activeTool, bloodDropVisible, slideHasBlood, playClickSound, playSuccessSound, playErrorSound, playDropSound, playSwabSound]);

  // --- Smear Creation Logic (now a click-based action) ---
  const handleCreateSmear = useCallback(() => {
    // Clear previous feedback immediately
    setFeedbackMessage('');
    setIsCorrectAction(null);

    console.log(`handleCreateSmear: activeTool=${activeTool}, slideHasBlood=${slideHasBlood}, currentStep=${currentStep}`);
    const currentProcedure = labProcedureSteps[currentStep];

    // Only allow smear creation if spreader slide is active, blood is on slide, and it's the correct step
    if (activeTool === 'spreader_slide' && slideHasBlood && currentProcedure?.id === 'perform_smear') {
      const quality = 'good'; // For now, always create a "good" smear to ensure progression
      const message = 'Excellent! Good quality blood smear created.';
      const isCorrect = true;
      const newScore = score + 30; // Award points for correct action

      setSmearQuality(quality);
      drawSmear(quality); // Draw the smear result on canvas
      setScore(newScore);
      setFeedbackMessage(message);
      setIsCorrectAction(isCorrect);
      setActiveTool(null); // Release spreader slide

      playSuccessSound();

      setTimeout(() => {
        setCurrentStep(prev => {
            console.log(`Transitioning step from ${prev} to ${prev + 1}`);
            return prev + 1;
        });
        setFeedbackMessage('');
        setIsCorrectAction(null);
      }, 1500);
    } else {
      // Provide specific feedback if conditions aren't met
      if (currentProcedure?.id !== 'perform_smear') {
          setFeedbackMessage('It\'s not time to create the smear yet. Follow the steps.');
      } else if (activeTool !== 'spreader_slide') {
          setFeedbackMessage('First, pick up the Spreader Slide.');
      } else if (!slideHasBlood) {
          setFeedbackMessage('You need to collect blood on the slide first.');
      }
      setIsCorrectAction(false);
      playErrorSound();
      setTimeout(() => { setFeedbackMessage(''); setIsCorrectAction(null); }, 3000);
    }
  }, [activeTool, slideHasBlood, currentStep, score, drawSmear, playSuccessSound, playErrorSound, labProcedureSteps]);


  // --- General Action Handler (for clicks on tools/buttons) ---
  const handleAction = useCallback((objectId) => {
    // Clear previous feedback immediately
    setFeedbackMessage('');
    setIsCorrectAction(null);

    const currentProcedure = labProcedureSteps[currentStep];
    let newScore = score;
    let message = '';
    let isCorrect = false;
    let proceedToNextStep = false;

    switch (currentProcedure.action) {
      case 'pick_up_tool':
        if (objectId === currentProcedure.target) {
          setActiveTool(objectId);
          message = `${objectId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} picked up.`;
          isCorrect = true;
          proceedToNextStep = true;
          playSuccessSound();
        } else {
          message = `Incorrect. Please pick up the ${currentProcedure.target.replace(/_/g, ' ')}.`;
          isCorrect = false;
        }
        break;
      case 'next_step_button':
        if (objectId === 'next_button') {
          message = 'Proceeding to the next step.';
          isCorrect = true;
          proceedToNextStep = true;
          playSuccessSound();
        } else {
          message = 'Please click the "Next" button.';
          isCorrect = false;
        }
        break;
      case 'auto_advance_blood_drop': // Handle the new auto-advance step
        if (currentProcedure.id === 'wait_for_second_drop') {
            setBloodDropVisible(true); // Make the second drop appear
            message = 'Second blood drop formed. Now collect it!';
            isCorrect = true;
            proceedToNextStep = true;
            playDropSound(); // Play a sound for the new drop
        }
        break;
      case 'click_create_smear': // Handle the new click-to-create-smear action
        if (objectId === 'create_smear_button') {
            handleCreateSmear(); // Delegate to the smear creation function
            return; // handleCreateSmear will manage feedback and step progression
        }
        break;
      case 'view_microscope':
        if (objectId === 'microscope_icon') {
          setShowMicroscopeView(true);
          message = 'Observing smear under microscope.';
          isCorrect = true; // This action itself is correct
          // DO NOT set proceedToNextStep = true here, as closing the view advances the step
          playSuccessSound();
        } else {
          message = 'Incorrect. Click the microscope icon to view the smear.';
          isCorrect = false;
        }
        break;
      case 'mcq_handled_internally': // This case now signifies MCQ completion handled by MCQChallenge
        // The MCQChallenge component will directly call setScore and setCurrentStep
        // This 'action' is just a placeholder to prevent default feedback handling here.
        return;
      default:
        message = 'Invalid action for this step.';
        isCorrect = false;
        break;
    }

    // Only set feedback and advance if not handled by a delegated function (like handleCreateSmear or MCQ)
    // And only if proceedToNextStep is explicitly true (for non-microscope view actions)
    if (proceedToNextStep) {
        setTimeout(() => {
          setCurrentStep(prev => {
              console.log(`Transitioning step from ${prev} to ${prev + 1}`);
              return prev + 1;
          });
          setFeedbackMessage('');
          setIsCorrectAction(null);
        }, 1500);
    } else if (currentProcedure.action !== 'click_create_smear' && currentProcedure.action !== 'mcq_handled_internally' && currentProcedure.action !== 'view_microscope') {
        // For incorrect actions or actions that don't immediately advance, just show feedback
        setScore(newScore); // Update score even for incorrect actions if points are deducted
        setFeedbackMessage(message);
        setIsCorrectAction(isCorrect);
        if (!isCorrect && currentProcedure.action !== 'use_tool_on_target') playErrorSound(); // Avoid double error sound
        setTimeout(() => {
            setFeedbackMessage('');
            setIsCorrectAction(null);
        }, 3000);
    }
    // For 'view_microscope' action, feedback is set, but no auto-advance here.
    // For 'click_create_smear' and 'mcq_handled_internally', their respective handlers manage feedback and advance.

  }, [currentStep, score, activeTool, playSuccessSound, playErrorSound, playDropSound, handleCreateSmear]);

  // Effect to handle auto-advancing steps
  useEffect(() => {
    const currentProcedure = labProcedureSteps[currentStep];
    if (currentProcedure && currentProcedure.action === 'auto_advance_blood_drop') {
      // Simulate a brief delay before the second drop appears and auto-advances
      const timer = setTimeout(() => {
        handleAction(currentProcedure.target); // Trigger the action for this step
      }, 2000); // 2-second delay for the drop to "form"
      return () => clearTimeout(timer);
    }
  }, [currentStep, handleAction, labProcedureSteps]);


  // --- UI Elements ---
  const ToolButton = ({ id, label, icon, onClick, isDraggable = false }) => {
    const currentProcedure = labProcedureSteps[currentStep];
    const isPickUpTarget = currentProcedure?.action === 'pick_up_tool' && currentProcedure?.target === id;
    const isToolForDragTarget = currentProcedure?.action === 'use_tool_on_target' && currentProcedure?.tool === id;

    // A tool is clickable if it's the target to be picked up
    const isClickable = isPickUpTarget;

    // A tool is draggable from the panel if it's meant to be dragged to a target area
    const canBeDraggedFromPanel = isDraggable && isToolForDragTarget;

    // Visual active state: if it's the currently held tool
    const isActive = activeTool === id;

    // Visual highlighting: if it's the tool to be picked up OR the tool to be dragged from panel
    const isHighlighted = isPickUpTarget || canBeDraggedFromPanel;

    return (
      <button
        id={id}
        className={`flex flex-col items-center justify-center p-3 md:p-4 rounded-xl shadow-md transition-all duration-200 ease-in-out
          ${isActive ? 'bg-indigo-400 text-white transform scale-105' : 'bg-white text-gray-800 hover:bg-gray-100'}
          ${isHighlighted && !isActive ? 'border-2 border-dashed border-purple-500 animate-pulse' : 'border-2 border-transparent'}
          ${activeTool === id ? 'ring-4 ring-blue-500 ring-opacity-75' : ''}
          ${(isClickable || canBeDraggedFromPanel) ? 'cursor-pointer' : 'opacity-70 cursor-not-allowed'}
        `}
        onClick={isClickable ? () => onClick(id) : null}
        draggable={canBeDraggedFromPanel} // Only draggable if relevant for current step and meant for dragging from panel
        onDragStart={canBeDraggedFromPanel ? handleDragStart(id) : null}
      >
        <span className="text-2xl md:text-4xl mb-1">{icon}</span>
        <span className="text-xs md:text-sm font-semibold text-center">{label}</span>
      </button>
    );
  };

  const TargetArea = ({ id, label, icon, onDrop, children }) => {
    const currentProcedure = labProcedureSteps[currentStep];
    const isTarget = currentProcedure?.target === id || (Array.isArray(currentProcedure?.target) && currentProcedure?.target.includes(id));
    const isCurrentlyActiveTarget = isTarget && activeTool === currentProcedure?.tool; // Highlight only if the correct tool is active

    return (
      <div
        id={id}
        className={`relative flex flex-col items-center justify-center p-4 md:p-6 rounded-xl border-2 transition-all duration-200 ease-in-out w-full max-w-sm
          ${isCurrentlyActiveTarget ? 'border-purple-600 bg-purple-50 animate-pulse' : 'border-gray-300 bg-gray-50'}
          ${activeTool && isTarget ? 'cursor-copy' : 'cursor-default'}
        `}
        onDragOver={handleDragOver}
        onDrop={isCurrentlyActiveTarget ? onDrop : null} // Only allow drop if it's the current target with the correct active tool
      >
        <span className="text-3xl md:text-5xl mb-2">{icon}</span>
        <span className="text-sm md:text-base font-semibold text-gray-700 text-center">{label}</span>
        {children}
      </div>
    );
  };

  // --- Reset Simulation ---
  const resetSimulation = useCallback(() => {
    setCurrentStep(0);
    setScore(0);
    setFeedbackMessage('');
    setIsCorrectAction(null);
    setActiveTool(null);
    setBloodDropVisible(false);
    setSlideHasBlood(false);
    setSmearQuality(null);
    setShowMicroscopeView(false);

    // Clear smear canvas
    const smearCtx = smearCanvasRef.current?.getContext('2d');
    if (smearCtx) smearCtx.clearRect(0, 0, smearCanvasRef.current.width, smearCanvasRef.current.height);
    // Clear microscope view canvas
    const microCtx = microscopeViewCanvasRef.current?.getContext('2d');
    if (microCtx) microCtx.clearRect(0, 0, microscopeViewCanvasRef.current.width, microscopeViewCanvasRef.current.height);

    playClickSound();
  }, [playClickSound]);


  // --- Video Player Component ---
  const VideoPlayer = ({ videoId, onVideoComplete }) => {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 p-6 font-inter">
        <div className="bg-white p-8 rounded-xl shadow-2xl max-w-4xl w-full text-center border-4 border-indigo-500 animate-fade-in">
          <h2 className="text-3xl md:text-4xl font-extrabold text-indigo-700 mb-6">
            Real-Life Demonstration
          </h2>
          <p className="text-lg text-gray-700 mb-6">
            Watch this video to see the blood smear preparation process in action.
          </p>
          <div className="relative w-full h-0 pb-[56.25%] mb-8 rounded-lg overflow-hidden shadow-lg">
            <iframe
              className="absolute top-0 left-0 w-full h-full"
              src={`https://www.youtube.com/embed/${videoId}?rel=0`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            ></iframe>
          </div>
          <button
            onClick={onVideoComplete}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-indigo-300 text-lg md:text-xl"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  // --- MCQ Challenge Component ---
  const MCQChallenge = ({ question, options, correctAnswer, onQuizComplete }) => {
    const [selectedOption, setSelectedOption] = useState(null);
    const [localFeedback, setLocalFeedback] = useState('');
    const [localIsCorrect, setLocalIsCorrect] = useState(null);

    const handleSubmit = () => {
      if (selectedOption === null) {
        setLocalFeedback('Please select an answer.');
        setLocalIsCorrect(null);
        return;
      }

      const isCorrectAnswer = (selectedOption === correctAnswer);

      if (isCorrectAnswer) {
        setLocalFeedback('Correct! Well done.');
        setLocalIsCorrect(true);
      } else {
        setLocalFeedback(`Incorrect. The correct answer was: ${correctAnswer}`);
        setLocalIsCorrect(false);
      }

      // After a short delay, signal completion to the parent component
      setTimeout(() => {
        onQuizComplete(isCorrectAnswer); // Pass correctness back to parent
      }, 2000); // Show feedback for 2 seconds
    };

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-green-100 to-teal-200 p-6 font-inter">
        <div className="bg-white p-8 rounded-xl shadow-2xl max-w-3xl w-full text-center border-4 border-teal-500 animate-fade-in">
          <h2 className="text-3xl md:text-4xl font-extrabold text-teal-700 mb-6">
            Knowledge Check!
          </h2>
          <p className="text-lg text-gray-700 mb-6 leading-relaxed">
            {question}
          </p>
          <div className="flex flex-col space-y-4 mb-8">
            {options.map((option, index) => (
              <button
                key={index}
                onClick={() => setSelectedOption(option)}
                className={`w-full p-4 rounded-lg border-2 text-left font-semibold transition-all duration-200
                  ${selectedOption === option ? 'bg-teal-400 text-white border-teal-600 shadow-md' : 'bg-white text-gray-800 border-gray-300 hover:bg-teal-50 hover:border-teal-300'}
                  ${localIsCorrect === true && selectedOption === option ? 'bg-green-500 border-green-700 text-white' : ''}
                  ${localIsCorrect === false && selectedOption === option ? 'bg-red-500 border-red-700 text-white' : ''}
                `}
                disabled={localIsCorrect !== null} // Disable buttons after answer
              >
                {option}
              </button>
            ))}
          </div>
          <button
            onClick={handleSubmit}
            className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-teal-300 text-lg md:text-xl disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={localIsCorrect !== null} // Disable submit after answer
          >
            Submit Answer
          </button>
          {localFeedback && (
            <div className={`mt-6 p-4 rounded-lg text-white font-bold text-xl ${localIsCorrect ? 'bg-green-500' : 'bg-red-500'}`}>
              {localFeedback}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Log current state for debugging
  console.log('--- App Render ---');
  console.log('Current Step:', currentStep, '(', labProcedureSteps[currentStep]?.id, ')');
  console.log('Active Tool:', activeTool);
  console.log('Slide Has Blood:', slideHasBlood);
  console.log('Feedback Message:', feedbackMessage);
  console.log('Is Correct Action:', isCorrectAction);
  console.log('------------------');


  return (
    <div className="relative w-full min-h-screen bg-gradient-to-br from-sky-100 to-indigo-200 flex flex-col items-center justify-start font-inter overflow-hidden pb-8">
      {/* Header */}
      <header className="w-full shadow-lg bg-indigo-800 py-4 md:py-6 mb-4 md:mb-8">
        <h1 className="text-2xl md:text-4xl text-white font-extrabold text-center tracking-wide">
          Kings Polytechnic Online
        </h1>
        <p className="text-center text-indigo-200 font-medium mt-1 md:mt-2 text-sm md:text-base">
          Virtual Medical Lab Practical
        </p>
      </header>

      {/* Main Content Area */}
      <main className="flex flex-col items-center w-full max-w-6xl px-4">

        {/* Top Instruction & Score Bar */}
        {currentStep < labProcedureSteps.length - 1 && currentStep !== 0 && labProcedureSteps[currentStep]?.id !== 'mcq_challenge' && ( // Hide for intro, final completion, and MCQ
          <div className="bg-white bg-opacity-95 rounded-xl shadow-xl p-4 md:p-6 w-full mb-6 border-b-4 border-purple-500 animate-fade-in">
            <h2 className="text-lg md:text-xl font-bold text-gray-800 mb-2">Current Task:</h2>
            <p className="text-base md:text-lg text-gray-700">{labProcedureSteps[currentStep]?.instruction}</p>
            <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
              <span className="text-xl md:text-2xl font-semibold text-purple-700">Score: {score}</span>
              <span className="text-md md:text-lg font-semibold text-gray-600">Step {currentStep} / {labProcedureSteps.length - 1}</span>
            </div>
          </div>
        )}


        {/* Feedback Message */}
        {feedbackMessage && (
          <div className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4 md:p-6 rounded-lg shadow-2xl text-white text-center font-bold text-xl md:text-2xl z-50 animate-fade-in transition-all duration-300 ease-in-out
            ${isCorrectAction === true ? 'bg-green-600' : 'bg-red-600'}`}>
            {feedbackMessage}
          </div>
        )}

        {/* Render different screens based on currentStep */}
        {currentStep === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-20 bg-black bg-opacity-70 pointer-events-auto">
            <div className="bg-white p-8 md:p-12 rounded-xl shadow-2xl text-center border-4 border-purple-500 animate-scale-in transform transition-all duration-300 ease-in-out scale-95 md:scale-100">
              <h1 className="text-3xl md:text-5xl font-extrabold text-purple-700 mb-4">Kings Polytechnic Online</h1>
              <p className="text-base md:text-lg text-gray-700 mb-6">
                Learn the step-by-step procedure for preparing a blood smear, from patient preparation to microscopic observation.
              </p>
              <button
                onClick={() => { setCurrentStep(1); playClickSound(); }}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-purple-300 text-lg md:text-xl"
              >
                Start Simulation
              </button>
            </div>
          </div>
        )}

        {/* Lab Workspace (visible for core simulation steps) */}
        {currentStep > 0 && currentStep < labProcedureSteps.findIndex(step => step.id === 'video_demonstration') && !showMicroscopeView && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
            {/* Tools Column */}
            <div className="md:col-span-1 bg-white rounded-xl shadow-lg p-4 md:p-6 flex flex-col items-center space-y-4 border-2 border-gray-200">
              <h3 className="text-xl font-bold text-gray-800 mb-2">Tools</h3>
              <ToolButton id="alcohol_swab" label="Alcohol Swab" icon="🩹" onClick={handleAction} isDraggable={true} />
              <ToolButton id="lancet" label="Lancet" icon="💉" onClick={handleAction} isDraggable={true} />
              <ToolButton id="clean_slide" label="Clean Slide" icon="🔬" onClick={handleAction} isDraggable={true} />
              <ToolButton id="spreader_slide" label="Spreader Slide" icon="📏" onClick={handleAction} isDraggable={true} />
            </div>

            {/* Workspace Column */}
            <div className="md:col-span-2 bg-white rounded-xl shadow-lg p-4 md:p-6 flex flex-col items-center justify-around space-y-6 border-2 border-gray-200">
              <h3 className="text-xl font-bold text-gray-800 mb-2">Workspace</h3>

              {/* Patient Finger Area */}
              <TargetArea
                id="finger"
                label="Patient Finger"
                icon="👆"
                onDrop={handleDrop('finger')}
                ref={fingerRef}
              >
                {/* Blood drop icon appears only when bloodDropVisible is true */}
                {bloodDropVisible && (
                  <span className="absolute text-3xl md:text-5xl top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-600 animate-pulse">🩸</span>
                )}
              </TargetArea>

              {/* Blood Drop Target (always present in DOM, visibility controlled by state) */}
              <TargetArea
                id="blood_drop"
                label="Blood Drop"
                icon="💧"
                onDrop={handleDrop('blood_drop')}
              >
                {bloodDropVisible && (
                  <span className="absolute text-3xl md:text-5xl top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-600 animate-pulse">🩸</span>
                )}
              </TargetArea>

              {/* Clean Slide & Smear Area */}
              <TargetArea
                id="clean_slide_area"
                label="Glass Slide"
                icon="⬜"
                onDrop={handleDrop('clean_slide_area')} // For dropping the blood onto the slide
                ref={slideRef}
              >
                {slideHasBlood && (
                  <canvas
                    ref={smearCanvasRef}
                    width="200"
                    height="100"
                    className={`absolute rounded-md transition-opacity duration-500
                      ${smearQuality ? 'border-2' : ''}
                      ${smearQuality === 'good' ? 'border-green-500' : smearQuality ? 'border-red-500' : ''}
                    `}
                  ></canvas>
                )}
              </TargetArea>

              {/* Create Smear Button (for perform_smear step) */}
              {labProcedureSteps[currentStep]?.id === 'perform_smear' && activeTool === 'spreader_slide' && slideHasBlood && (
                 <button
                   onClick={() => handleAction('create_smear_button')}
                   className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-300 text-lg md:text-xl pointer-events-auto mt-6"
                 >
                   Create Smear
                 </button>
              )}

              {/* Next Step Button (for air_dry and procedure_complete) AND View Smear Button (for microscope_observation) */}
              {(labProcedureSteps[currentStep]?.id === 'air_dry' || labProcedureSteps[currentStep]?.id === 'microscope_observation' || labProcedureSteps[currentStep]?.id === 'procedure_complete') && (
                <button
                  onClick={() => {
                    if (labProcedureSteps[currentStep]?.id === 'microscope_observation') {
                      handleAction('microscope_icon'); // Correctly trigger microscope view
                    } else {
                      handleAction('next_button'); // For 'air_dry' and 'procedure_complete'
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-300 text-lg md:text-xl pointer-events-auto mt-6"
                >
                  {labProcedureSteps[currentStep]?.id === 'air_dry' ? 'Next Step' :
                   labProcedureSteps[currentStep]?.id === 'microscope_observation' ? 'View Smear under Microscope' :
                   'Continue'}
                </button>
              )}

            </div>
          </div>
        )}

        {/* Microscope Observation View */}
        {showMicroscopeView && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-40 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl p-6 md:p-8 text-center border-4 border-indigo-500 flex flex-col items-center">
              <h2 className="text-2xl md:text-3xl font-extrabold text-indigo-700 mb-4">Microscopic View</h2>
              <canvas
                ref={microscopeViewCanvasRef}
                width="400"
                height="400"
                className="bg-black rounded-full border-4 border-gray-700 mb-6"
              ></canvas>
              {smearQuality && (
                <p className={`text-xl md:text-2xl font-bold mb-4 ${smearQuality === 'good' ? 'text-green-700' : 'text-red-700'}`}>
                  Smear Quality: {smearQuality.replace('_', ' ').toUpperCase()}
                </p>
              )}
              <button
                onClick={() => { setShowMicroscopeView(false); setCurrentStep(prev => {
                    console.log(`Transitioning step from ${prev} to ${prev + 1}`);
                    return prev + 1;
                }); playClickSound(); }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-300 text-lg md:text-xl"
              >
                Close View & Finish
              </button>
            </div>
          </div>
        )}

        {/* Video Demonstration Screen */}
        {labProcedureSteps[currentStep]?.id === 'video_demonstration' && (
          <VideoPlayer
            videoId="KSs0SMfERuA" // YouTube video ID for "Blood Smear Preparation and Staining Practical Lab"
            onVideoComplete={() => handleAction('next_button')} // Use handleAction to advance step
          />
        )}

        {/* MCQ Challenge Screen */}
        {labProcedureSteps[currentStep]?.id === 'mcq_challenge' && (
          <MCQChallenge
            question="Which of the following is the primary purpose of wiping away the first drop of blood during a finger prick for a blood smear?"
            options={[
              "To reduce pain for the patient.",
              "To remove tissue fluid contamination.",
              "To ensure the blood drop is larger.",
              "To sterilize the finger further."
            ]}
            correctAnswer="To remove tissue fluid contamination."
            onQuizComplete={(isAnswerCorrect) => {
              // This callback is triggered by MCQChallenge when an answer is submitted
              if (isAnswerCorrect) {
                setScore(prev => prev + 50); // Award points for correct MCQ answer
                setFeedbackMessage('Correct! Well done.');
                setIsCorrectAction(true);
              } else {
                setFeedbackMessage('Incorrect. Try to review the video demonstration.');
                setIsCorrectAction(false);
              }
              playClickSound(); // Play a click sound on answer submission

              // Advance to the next step after showing feedback
              setTimeout(() => {
                setCurrentStep(prev => {
                  console.log(`Transitioning step from ${prev} to ${prev + 1}`);
                  return prev + 1;
                });
                setFeedbackMessage('');
                setIsCorrectAction(null);
              }, 2000); // Show feedback for 2 seconds before advancing
            }}
          />
        )}


        {/* Final Completion Message */}
        {labProcedureSteps[currentStep]?.id === 'final_completion' && (
          <div className="absolute inset-0 flex items-center justify-center z-20 bg-black bg-opacity-70 pointer-events-auto">
            <div className="bg-white p-8 md:p-12 rounded-xl shadow-2xl text-center border-4 border-green-500 animate-scale-in transform transition-all duration-300 ease-in-out scale-95 md:scale-100">
              <h1 className="text-3xl md:text-5xl font-extrabold text-green-700 mb-4">Kings Polytechnic Online</h1>
              <p className="text-base md:text-lg text-gray-700 mb-6">
                You have successfully completed the Blood Smear Preparation module, including the simulation, video demonstration, and knowledge check!
              </p>
              <p className="text-2xl md:text-3xl font-bold text-green-800 mb-8">
                Final Score: {score} points!
              </p>
              <button
                onClick={resetSimulation}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-full shadow-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-green-300 text-lg md:text-xl"
              >
                Restart Simulation
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-10 text-center text-xs text-gray-500 opacity-70">
        &copy; {new Date().getFullYear()} Kings Polytechnic Online | Virtual Laboratory Practical
      </footer>
    </div>
  );
}

export default App;
