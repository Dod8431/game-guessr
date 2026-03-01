import { useState, useEffect, useCallback, useRef } from "react";
import * as THREE from "three";

// ============================================================================
// DATA CONFIGURATION
// ============================================================================
// To add a new game:
// 1. Add an entry to GAMES_DB with the game info
// 2. Add panorama URLs (equirectangular 360° images) to the rounds
// 3. Add the game's world map image URL
// 4. Set correct coordinates on the map (as % of map image dimensions)
//
// For panorama images: use Nvidia Ansel, ReShade 360° shader, or manual stitching
// For world maps: grab high-res maps from game wikis (e.g., IGN maps, fandom wikis)
// ============================================================================

const GAMES_DB = [
  {
    id: "gtav",
    name: "Grand Theft Auto V",
    aliases: ["gta v", "gta 5", "gta5", "gtav", "grand theft auto 5", "grand theft auto v"],
    // Replace these with real equirectangular panorama URLs
    // Use Nvidia Ansel in GTA V to capture 360° screenshots
    mapImage: "MAP_IMAGE_URL_HERE",
    rounds: [
      {
        panorama: "PANORAMA_URL_HERE",
        correctMapPos: { x: 52, y: 68 }, // % position on the map image
        locationName: "Vinewood Sign",
      },
      {
        panorama: "PANORAMA_URL_HERE",
        correctMapPos: { x: 35, y: 45 },
        locationName: "Del Perro Pier",
      },
      {
        panorama: "PANORAMA_URL_HERE",
        correctMapPos: { x: 78, y: 22 },
        locationName: "Sandy Shores",
      },
    ],
  },
  {
    id: "skyrim",
    name: "The Elder Scrolls V: Skyrim",
    aliases: ["skyrim", "elder scrolls v", "elder scrolls 5", "tes v", "tes5", "the elder scrolls v skyrim"],
    mapImage: "MAP_IMAGE_URL_HERE",
    rounds: [
      {
        panorama: "PANORAMA_URL_HERE",
        correctMapPos: { x: 45, y: 55 },
        locationName: "Whiterun",
      },
      {
        panorama: "PANORAMA_URL_HERE",
        correctMapPos: { x: 60, y: 30 },
        locationName: "Windhelm",
      },
      {
        panorama: "PANORAMA_URL_HERE",
        correctMapPos: { x: 25, y: 70 },
        locationName: "Markarth",
      },
    ],
  },
  {
    id: "rdr2",
    name: "Red Dead Redemption 2",
    aliases: ["rdr2", "red dead 2", "red dead redemption 2", "red dead redemption ii"],
    mapImage: "MAP_IMAGE_URL_HERE",
    rounds: [
      {
        panorama: "PANORAMA_URL_HERE",
        correctMapPos: { x: 50, y: 50 },
        locationName: "Valentine",
      },
      {
        panorama: "PANORAMA_URL_HERE",
        correctMapPos: { x: 30, y: 65 },
        locationName: "Saint Denis",
      },
      {
        panorama: "PANORAMA_URL_HERE",
        correctMapPos: { x: 70, y: 35 },
        locationName: "Strawberry",
      },
    ],
  },
];

// ============================================================================
// DEMO DATA - placeholder panoramas and maps for testing
// These use generated gradient spheres so the app works without real images
// Replace with real URLs when you have actual 360° screenshots
// ============================================================================

const DEMO_GAMES = [
  {
    id: "demo_fantasy",
    name: "Mass Effect Andromeda",
    aliases: ["mass effect andromeda", "mea", "mass effect 4", "andromeda"],
    mapImage: "https://res.cloudinary.com/dekc2zhms/image/upload/v1772329696/MEA_Map1_lyuvsh.jpg", // Will use generated map
    rounds: [
      { panorama: "https://res.cloudinary.com/dekc2zhms/image/upload/v1772328903/MEA_Panorama1_oko6tt.jpg", correctMapPos: { x: 35, y: 42 }, locationName: "Habitat 7" },
      { panorama: "https://res.cloudinary.com/dekc2zhms/image/upload/v1772328903/MEA_Panorama1_oko6tt.jpg", correctMapPos: { x: 62, y: 28 }, locationName: "Eos - Prodromos" },
      { panorama: "https://res.cloudinary.com/dekc2zhms/image/upload/v1772328903/MEA_Panorama1_oko6tt.jpg", correctMapPos: { x: 48, y: 65 }, locationName: "Kadara Port" },
    ],
  },
];

// Use demo data if real data has placeholder URLs
const getActiveGames = () => {
  const realGames = GAMES_DB.filter(
    (g) => g.mapImage && !g.mapImage.includes("URL_HERE") && g.rounds.some((r) => r.panorama && !r.panorama.includes("URL_HERE"))
  );
  return realGames.length > 0 ? realGames : DEMO_GAMES;
};

// ============================================================================
// CONSTANTS
// ============================================================================
const TOTAL_ROUNDS = 10;
const PHASE1_TIME = 60;
const PHASE2_TIME = 60;
const MAX_GUESSES = 3;
const NAME_CORRECT_POINTS = 1000;
const MAX_MAP_POINTS = 4000;
const MAX_DISTANCE = 100; // max distance in map % units (diagonal of map)

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function normalizeString(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function checkGameName(guess, game) {
  const normalized = normalizeString(guess);
  if (normalizeString(game.name) === normalized) return true;
  return game.aliases.some((a) => normalizeString(a) === normalized);
}

function calcDistance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function calcMapPoints(guessPos, correctPos) {
  const dist = calcDistance(guessPos, correctPos);
  if (dist < 1) return MAX_MAP_POINTS;
  if (dist > MAX_DISTANCE) return 0;
  return Math.round(MAX_MAP_POINTS * (1 - dist / MAX_DISTANCE));
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateRounds(games, count) {
  // Build a pool of all rounds from all games, then shuffle and pick
  const pool = [];
  for (const game of games) {
    for (const round of game.rounds) {
      pool.push({ ...round, game });
    }
  }
  const shuffled = shuffleArray(pool);
  // If we don't have enough, repeat
  const rounds = [];
  while (rounds.length < count) {
    for (const r of shuffled) {
      rounds.push(r);
      if (rounds.length >= count) break;
    }
  }
  return rounds;
}

// ============================================================================
// PANORAMA VIEWER COMPONENT (360° equirectangular via Three.js)
// ============================================================================

function PanoramaViewer({ imageUrl, isDemo }) {
  const containerRef = useRef(null);
  const cleanupRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    setLoading(true);
    setError(null);

    // Setup renderer
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Scene & camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1100);
    camera.position.set(0, 0, 0.1);

    // Create sphere geometry (inside-out so texture faces inward)
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);

    const addMeshToScene = (texture) => {
      if (destroyed) return;
      const material = new THREE.MeshBasicMaterial({ map: texture });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      setLoading(false);
    };

    if (isDemo || !imageUrl) {
      // Generate demo texture
      const c = document.createElement("canvas");
      c.width = 2048;
      c.height = 1024;
      const ctx = c.getContext("2d");

      const skyGrad = ctx.createLinearGradient(0, 0, 0, 1024);
      skyGrad.addColorStop(0, "#0a0a2e");
      skyGrad.addColorStop(0.4, "#16213e");
      skyGrad.addColorStop(0.55, "#1a1a3e");
      skyGrad.addColorStop(0.6, "#2a2a2a");
      skyGrad.addColorStop(1, "#1a1a1a");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, 2048, 1024);

      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      for (let x = 0; x < 2048; x += 64) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke();
      }
      for (let y = 0; y < 1024; y += 64) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(2048, y); ctx.stroke();
      }

      for (let i = 0; i < 30; i++) {
        const bx = (i * 137) % 2048;
        const bh = 60 + (i * 73) % 150;
        const bw = 25 + (i * 47) % 50;
        ctx.fillStyle = `hsla(${(i * 37) % 360}, 30%, ${15 + (i % 4) * 8}%, 0.8)`;
        ctx.fillRect(bx, 580 - bh, bw, bh);
        ctx.fillStyle = `hsla(45, 70%, 60%, 0.4)`;
        for (let wy = 580 - bh + 8; wy < 576; wy += 14) {
          for (let wx = bx + 4; wx < bx + bw - 4; wx += 9) {
            ctx.fillRect(wx, wy, 4, 6);
          }
        }
      }

      for (let i = 0; i < 200; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.6})`;
        ctx.beginPath();
        ctx.arc(Math.random() * 2048, Math.random() * 450, 0.5 + Math.random() * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.font = "24px monospace";
      ctx.textAlign = "center";
      ctx.fillText("DEMO MODE — Drag to look around", 1024, 980);

      addMeshToScene(new THREE.CanvasTexture(c));
    } else {
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = "anonymous";
      loader.load(
        imageUrl,
        (texture) => addMeshToScene(texture),
        undefined,
        (err) => {
          if (!destroyed) {
            console.error("Failed to load panorama:", err);
            setError("Failed to load panorama image");
            setLoading(false);
          }
        }
      );
    }

    // Drag controls
    let isDragging = false;
    let lastX = 0, lastY = 0;
    let lon = 0, lat = 0;

    const onPointerDown = (e) => {
      isDragging = true;
      lastX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      lastY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
      renderer.domElement.style.cursor = "grabbing";
    };
    const onPointerMove = (e) => {
      if (!isDragging) return;
      const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
      lon += (lastX - x) * 0.15;
      lat += (y - lastY) * 0.15;
      lat = Math.max(-85, Math.min(85, lat));
      lastX = x;
      lastY = y;
    };
    const onPointerUp = () => {
      isDragging = false;
      renderer.domElement.style.cursor = "grab";
    };
    const onWheel = (e) => {
      camera.fov = Math.max(30, Math.min(100, camera.fov + e.deltaY * 0.05));
      camera.updateProjectionMatrix();
    };

    renderer.domElement.style.cursor = "grab";
    renderer.domElement.addEventListener("mousedown", onPointerDown);
    renderer.domElement.addEventListener("mousemove", onPointerMove);
    renderer.domElement.addEventListener("mouseup", onPointerUp);
    renderer.domElement.addEventListener("mouseleave", onPointerUp);
    renderer.domElement.addEventListener("touchstart", onPointerDown, { passive: true });
    renderer.domElement.addEventListener("touchmove", onPointerMove, { passive: true });
    renderer.domElement.addEventListener("touchend", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: true });

    // Animation loop
    const animate = () => {
      if (destroyed) return;
      requestAnimationFrame(animate);

      const phi = THREE.MathUtils.degToRad(90 - lat);
      const theta = THREE.MathUtils.degToRad(lon);

      camera.lookAt(
        500 * Math.sin(phi) * Math.cos(theta),
        500 * Math.cos(phi),
        500 * Math.sin(phi) * Math.sin(theta)
      );
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const onResize = () => {
      if (destroyed) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w && h) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    };
    window.addEventListener("resize", onResize);

    cleanupRef.current = () => {
      destroyed = true;
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      geometry.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };

    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, [imageUrl, isDemo]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative", background: "#000" }}>
      {loading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center",
          justifyContent: "center", flexDirection: "column", gap: 12, zIndex: 10,
          background: "#000"
        }}>
          <div style={{
            width: 40, height: 40, border: "3px solid rgba(255,255,255,0.1)",
            borderTopColor: "#00ff88", borderRadius: "50%",
            animation: "spin 1s linear infinite"
          }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
            color: "rgba(255,255,255,0.4)"
          }}>Loading panorama...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {error && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center",
          justifyContent: "center", flexDirection: "column", gap: 8, zIndex: 10,
          background: "#000"
        }}>
          <span style={{ fontSize: 32 }}>⚠️</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
            color: "#ff6666"
          }}>{error}</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            color: "rgba(255,255,255,0.3)", maxWidth: 300, textAlign: "center"
          }}>Check that the image URL is accessible and has CORS enabled</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAP PINPOINT COMPONENT
// ============================================================================

function MapPinpoint({ mapImage, game, onPin, pinPos, correctPos, showCorrect, disabled }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [mapZoom, setMapZoom] = useState(1);
  const dragRef = useRef({ isDragging: false, lastX: 0, lastY: 0, isPanning: false });

  const isDemo = !mapImage;

  // Draw the map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const container = containerRef.current;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resize();

    let animFrame;

    if (isDemo) {
      // Generate a demo map
      const draw = () => {
        const w = canvas.width;
        const h = canvas.height;
        ctx.save();
        ctx.translate(mapOffset.x, mapOffset.y);
        ctx.scale(mapZoom, mapZoom);

        // Background
        const bg = ctx.createLinearGradient(0, 0, w, h);
        bg.addColorStop(0, "#1a1a1a");
        bg.addColorStop(0.5, "#2a2a2a");
        bg.addColorStop(1, "#1a1a1a");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        // Grid
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 0.5;
        for (let x = 0; x < w; x += 40) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = 0; y < h; y += 40) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }

        // Draw terrain-like regions
        const seed = game?.id?.charCodeAt(0) || 65;
        const regions = [
          { cx: 0.3, cy: 0.4, r: 0.2, color: "rgba(34,87,44,0.4)", label: "Forest" },
          { cx: 0.6, cy: 0.3, r: 0.15, color: "rgba(140,120,80,0.4)", label: "Plains" },
          { cx: 0.5, cy: 0.65, r: 0.25, color: "rgba(60,60,80,0.4)", label: "City" },
          { cx: 0.8, cy: 0.5, r: 0.12, color: "rgba(60,100,140,0.4)", label: "Lake" },
          { cx: 0.2, cy: 0.7, r: 0.18, color: "rgba(120,80,50,0.4)", label: "Mountains" },
        ];

        for (const reg of regions) {
          const rx = reg.cx * w;
          const ry = reg.cy * h;
          const rr = reg.r * Math.min(w, h);
          const rGrad = ctx.createRadialGradient(rx, ry, 0, rx, ry, rr);
          rGrad.addColorStop(0, reg.color);
          rGrad.addColorStop(1, "transparent");
          ctx.fillStyle = rGrad;
          ctx.beginPath();
          ctx.arc(rx, ry, rr, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.font = "11px monospace";
          ctx.textAlign = "center";
          ctx.fillText(reg.label, rx, ry);
        }

        // Roads
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.1, h * 0.5);
        ctx.quadraticCurveTo(w * 0.3, h * 0.3, w * 0.5, h * 0.5);
        ctx.quadraticCurveTo(w * 0.7, h * 0.7, w * 0.9, h * 0.4);
        ctx.stroke();

        // Map title
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${game?.name || "World"} — Map`, w / 2, 30);

        // Draw pins
        if (pinPos) {
          const px = (pinPos.x / 100) * w;
          const py = (pinPos.y / 100) * h;
          drawPin(ctx, px, py, "#ff4444", "YOUR GUESS");
        }
        if (showCorrect && correctPos) {
          const cx = (correctPos.x / 100) * w;
          const cy = (correctPos.y / 100) * h;
          drawPin(ctx, cx, cy, "#44ff44", "CORRECT");

          // Draw line between pins
          if (pinPos) {
            const px = (pinPos.x / 100) * w;
            const py = (pinPos.y / 100) * h;
            ctx.strokeStyle = "rgba(255,255,0,0.5)";
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(cx, cy);
            ctx.stroke();
            ctx.setLineDash([]);

            // Distance label
            const dist = calcDistance(pinPos, correctPos);
            const midX = (px + cx) / 2;
            const midY = (py + cy) / 2;
            ctx.fillStyle = "rgba(255,255,0,0.8)";
            ctx.font = "bold 12px monospace";
            ctx.textAlign = "center";
            ctx.fillText(`${dist.toFixed(1)} units`, midX, midY - 10);
          }
        }

        ctx.restore();
        animFrame = requestAnimationFrame(draw);
      };
      draw();
    } else {
      // Real map image
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = mapImage;
      img.onload = () => {
        const draw = () => {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          ctx.save();
          ctx.translate(mapOffset.x, mapOffset.y);
          ctx.scale(mapZoom, mapZoom);

          ctx.drawImage(img, 0, 0, w, h);

          if (pinPos) {
            const px = (pinPos.x / 100) * w;
            const py = (pinPos.y / 100) * h;
            drawPin(ctx, px, py, "#ff4444", "YOUR GUESS");
          }
          if (showCorrect && correctPos) {
            const cx = (correctPos.x / 100) * w;
            const cy = (correctPos.y / 100) * h;
            drawPin(ctx, cx, cy, "#44ff44", "CORRECT");
          }

          ctx.restore();
          animFrame = requestAnimationFrame(draw);
        };
        draw();
      };
    }

    return () => cancelAnimationFrame(animFrame);
  }, [mapImage, isDemo, game, pinPos, correctPos, showCorrect, mapOffset, mapZoom]);

  function drawPin(ctx, x, y, color, label) {
    // Pin shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pin body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 8, y - 22);
    ctx.arc(x, y - 22, 8, Math.PI, 0, false);
    ctx.lineTo(x, y);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Pin center dot
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y - 22, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = color;
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y - 36);
  }

  const handleClick = (e) => {
    if (disabled || dragRef.current.isPanning) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left - mapOffset.x) / mapZoom / canvas.width) * 100;
    const y = ((e.clientY - rect.top - mapOffset.y) / mapZoom / canvas.height) * 100;
    if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
      onPin({ x, y });
    }
  };

  // Pan handling
  const handleMouseDown = (e) => {
    if (e.button === 1 || e.button === 2 || e.altKey) {
      dragRef.current = { isDragging: true, lastX: e.clientX, lastY: e.clientY, isPanning: true };
      e.preventDefault();
    }
  };
  const handleMouseMove = (e) => {
    if (dragRef.current.isDragging) {
      setMapOffset((prev) => ({
        x: prev.x + e.clientX - dragRef.current.lastX,
        y: prev.y + e.clientY - dragRef.current.lastY,
      }));
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
    }
  };
  const handleMouseUp = () => {
    setTimeout(() => { dragRef.current.isPanning = false; }, 50);
    dragRef.current.isDragging = false;
  };
  const handleWheel = (e) => {
    setMapZoom((z) => Math.max(0.5, Math.min(4, z + (e.deltaY > 0 ? -0.1 : 0.1))));
  };

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative", cursor: disabled ? "default" : "crosshair" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} onClick={handleClick} style={{ width: "100%", height: "100%", display: "block" }} />
      {!disabled && (
        <div style={{
          position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.7)", padding: "6px 14px", borderRadius: 6,
          color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "monospace", pointerEvents: "none"
        }}>
          Click to place pin • Scroll to zoom • Alt+drag to pan
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TIMER COMPONENT
// ============================================================================

function Timer({ seconds, maxSeconds, isActive, onTimeUp }) {
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
    setTimeLeft(seconds);
  }, [seconds]);

  useEffect(() => {
    if (!isActive || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval);
          onTimeUp();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive, timeLeft <= 0]);

  const pct = (timeLeft / maxSeconds) * 100;
  const isLow = timeLeft <= 10;
  const color = isLow ? "#ff3333" : timeLeft <= 20 ? "#ff8833" : "#00ff88";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{
        width: 140, height: 6, background: "rgba(255,255,255,0.1)",
        borderRadius: 3, overflow: "hidden"
      }}>
        <div style={{
          width: `${pct}%`, height: "100%", background: color,
          borderRadius: 3, transition: "width 1s linear, background 0.5s",
          boxShadow: isLow ? `0 0 10px ${color}` : "none"
        }} />
      </div>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
        fontSize: 22, color, minWidth: 40, textAlign: "right",
        animation: isLow ? "pulse 1s infinite" : "none"
      }}>
        {timeLeft}
      </span>
    </div>
  );
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

const SCREENS = { MENU: 0, PLAYING: 1, RESULTS: 2 };
const PHASES = { GUESS_NAME: 0, PIN_MAP: 1, ROUND_RESULT: 2 };

export default function App() {
  const [screen, setScreen] = useState(SCREENS.MENU);
  const [rounds, setRounds] = useState([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [phase, setPhase] = useState(PHASES.GUESS_NAME);
  const [score, setScore] = useState(0);
  const [roundScores, setRoundScores] = useState([]);

  // Phase 1 state
  const [guess, setGuess] = useState("");
  const [guessesLeft, setGuessesLeft] = useState(MAX_GUESSES);
  const [nameCorrect, setNameCorrect] = useState(false);
  const [wrongGuesses, setWrongGuesses] = useState([]);
  const [phase1TimerActive, setPhase1TimerActive] = useState(true);
  const [phase1Key, setPhase1Key] = useState(0);

  // Phase 2 state
  const [pinPos, setPinPos] = useState(null);
  const [phase2TimerActive, setPhase2TimerActive] = useState(false);
  const [phase2Confirmed, setPhase2Confirmed] = useState(false);
  const [phase2Key, setPhase2Key] = useState(0);

  const games = getActiveGames();
  const isDemo = games === DEMO_GAMES;
  const currentRoundData = rounds[currentRound];

  // Start a new game
  const startGame = () => {
    const newRounds = generateRounds(games, TOTAL_ROUNDS);
    setRounds(newRounds);
    setCurrentRound(0);
    setScore(0);
    setRoundScores([]);
    startRound();
    setScreen(SCREENS.PLAYING);
  };

  const startRound = () => {
    setPhase(PHASES.GUESS_NAME);
    setGuess("");
    setGuessesLeft(MAX_GUESSES);
    setNameCorrect(false);
    setWrongGuesses([]);
    setPhase1TimerActive(true);
    setPhase1Key((k) => k + 1);
    setPinPos(null);
    setPhase2TimerActive(false);
    setPhase2Confirmed(false);
    setPhase2Key((k) => k + 1);
  };

  // Phase 1: Guess game name
  const submitGuess = () => {
    if (!guess.trim() || !currentRoundData) return;
    if (checkGameName(guess, currentRoundData.game)) {
      setNameCorrect(true);
      setPhase1TimerActive(false);
      setTimeout(() => goToPhase2(), 1200);
    } else {
      setWrongGuesses((prev) => [...prev, guess]);
      setGuessesLeft((g) => {
        if (g <= 1) {
          setPhase1TimerActive(false);
          setTimeout(() => goToPhase2(), 1200);
          return 0;
        }
        return g - 1;
      });
      setGuess("");
    }
  };

  const phase1TimeUp = useCallback(() => {
    setPhase1TimerActive(false);
    setTimeout(() => goToPhase2(), 800);
  }, []);

  const goToPhase2 = () => {
    setPhase(PHASES.PIN_MAP);
    setPhase2TimerActive(true);
    setPhase2Key((k) => k + 1);
  };

  // Phase 2: Pin map
  const confirmPin = () => {
    if (!pinPos || !currentRoundData) return;
    setPhase2Confirmed(true);
    setPhase2TimerActive(false);
    showRoundResult();
  };

  const phase2TimeUp = useCallback(() => {
    setPhase2TimerActive(false);
    setPhase2Confirmed(true);
    showRoundResult();
  }, [pinPos, currentRoundData, nameCorrect]);

  const showRoundResult = () => {
    const namePoints = nameCorrect ? NAME_CORRECT_POINTS : 0;
    const mapPoints = pinPos && currentRoundData ? calcMapPoints(pinPos, currentRoundData.correctMapPos) : 0;
    const roundTotal = namePoints + mapPoints;

    setScore((s) => s + roundTotal);
    setRoundScores((prev) => [
      ...prev,
      {
        round: currentRound + 1,
        game: currentRoundData.game.name,
        location: currentRoundData.locationName,
        nameCorrect,
        namePoints,
        mapPoints,
        total: roundTotal,
        pinPos,
        correctPos: currentRoundData.correctMapPos,
      },
    ]);
    setPhase(PHASES.ROUND_RESULT);
  };

  const nextRound = () => {
    if (currentRound + 1 >= TOTAL_ROUNDS) {
      setScreen(SCREENS.RESULTS);
    } else {
      setCurrentRound((r) => r + 1);
      startRound();
    }
  };

  const lastRoundScore = roundScores[roundScores.length - 1];

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={{
      width: "100vw", height: "100vh", overflow: "hidden",
      background: "#0a0a0f", color: "#fff",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      position: "relative"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(0,255,136,0.3); }
          50% { box-shadow: 0 0 40px rgba(0,255,136,0.6); }
        }
        @keyframes correctFlash {
          0% { background: rgba(0,255,100,0.3); }
          100% { background: transparent; }
        }
        @keyframes wrongShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes scorePopIn {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }

        .btn-primary {
          background: linear-gradient(135deg, #00ff88, #00cc66);
          color: #000; border: none; padding: 14px 36px;
          font-family: 'Orbitron', monospace; font-weight: 700;
          font-size: 15px; border-radius: 8px; cursor: pointer;
          text-transform: uppercase; letter-spacing: 2px;
          transition: all 0.2s; position: relative; overflow: hidden;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(0,255,136,0.4);
        }
        .btn-primary:active { transform: translateY(0); }
        .btn-primary:disabled {
          opacity: 0.4; cursor: not-allowed; transform: none;
          box-shadow: none;
        }

        .btn-secondary {
          background: rgba(255,255,255,0.08); color: #fff;
          border: 1px solid rgba(255,255,255,0.15); padding: 12px 28px;
          font-family: 'Orbitron', monospace; font-weight: 600;
          font-size: 13px; border-radius: 8px; cursor: pointer;
          text-transform: uppercase; letter-spacing: 1px;
          transition: all 0.2s;
        }
        .btn-secondary:hover {
          background: rgba(255,255,255,0.15);
          border-color: rgba(255,255,255,0.3);
        }

        input[type="text"] {
          background: rgba(255,255,255,0.06); border: 2px solid rgba(255,255,255,0.12);
          color: #fff; padding: 14px 18px; font-size: 16px; border-radius: 8px;
          outline: none; width: 100%; font-family: 'Inter', sans-serif;
          transition: border-color 0.2s;
        }
        input[type="text"]:focus {
          border-color: #00ff88;
          box-shadow: 0 0 15px rgba(0,255,136,0.15);
        }
        input[type="text"]::placeholder {
          color: rgba(255,255,255,0.25);
        }
      `}</style>

      {/* Background pattern */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.03, pointerEvents: "none",
        backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
        backgroundSize: "40px 40px"
      }} />

      {/* ===== MENU SCREEN ===== */}
      {screen === SCREENS.MENU && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100%", gap: 40, padding: 24,
          animation: "fadeIn 0.5s ease"
        }}>
          {/* Decorative lines */}
          <div style={{
            position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
            width: 2, height: 120,
            background: "linear-gradient(to bottom, transparent, rgba(0,255,136,0.3), transparent)"
          }} />

          <div style={{ textAlign: "center" }}>
            <div style={{
              fontFamily: "'Orbitron', monospace", fontSize: "clamp(36px, 6vw, 64px)",
              fontWeight: 900, letterSpacing: 4,
              background: "linear-gradient(135deg, #00ff88, #00ccff, #ff00ff)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              lineHeight: 1.1
            }}>
              GAME
              <br />
              GUESSR
            </div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
              color: "rgba(255,255,255,0.35)", letterSpacing: 6,
              marginTop: 16, textTransform: "uppercase"
            }}>
              Video Game Edition
            </div>
          </div>

          <div style={{
            display: "flex", flexDirection: "column", gap: 12,
            alignItems: "center", maxWidth: 400, width: "100%"
          }}>
            <div style={{
              background: "rgba(255,255,255,0.04)", borderRadius: 12,
              padding: 24, width: "100%", border: "1px solid rgba(255,255,255,0.06)"
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                color: "rgba(255,255,255,0.4)", marginBottom: 16,
                textTransform: "uppercase", letterSpacing: 2
              }}>
                How to play
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { icon: "👁️", text: "View a 360° screenshot from a video game" },
                  { icon: "🎮", text: `Guess the game name (3 tries, 60s)` },
                  { icon: "📍", text: "Pinpoint the location on the game map (60s)" },
                  { icon: "⭐", text: "Score points for accuracy across 10 rounds" },
                ].map((step, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 12, alignItems: "center",
                    color: "rgba(255,255,255,0.6)", fontSize: 14,
                    fontFamily: "'Inter', sans-serif"
                  }}>
                    <span style={{ fontSize: 18 }}>{step.icon}</span>
                    <span>{step.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <button className="btn-primary" onClick={startGame}
              style={{ width: "100%", marginTop: 8, animation: "glow 2s infinite" }}>
              Start Game
            </button>

            {isDemo && (
              <div style={{
                background: "rgba(255,200,0,0.08)", border: "1px solid rgba(255,200,0,0.2)",
                borderRadius: 8, padding: 14, marginTop: 8, textAlign: "center",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                color: "rgba(255,200,0,0.7)", lineHeight: 1.6
              }}>
                ⚠️ Running in DEMO mode with generated visuals.
                <br />
                Add real panorama & map images to GAMES_DB for the full experience.
              </div>
            )}
          </div>

          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            color: "rgba(255,255,255,0.15)", letterSpacing: 1
          }}>
            {games.length} game{games.length !== 1 ? "s" : ""} loaded • {games.reduce((a, g) => a + g.rounds.length, 0)} locations
          </div>
        </div>
      )}

      {/* ===== PLAYING SCREEN ===== */}
      {screen === SCREENS.PLAYING && currentRoundData && (
        <div style={{
          display: "flex", flexDirection: "column", height: "100%",
          animation: "fadeIn 0.3s ease"
        }}>
          {/* Top bar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 20px", background: "rgba(0,0,0,0.5)",
            borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, gap: 12,
            flexWrap: "wrap"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{
                fontFamily: "'Orbitron', monospace", fontSize: 13,
                color: "#00ff88", fontWeight: 700
              }}>
                ROUND {currentRound + 1}
                <span style={{ color: "rgba(255,255,255,0.3)" }}>/{TOTAL_ROUNDS}</span>
              </div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                color: "rgba(255,255,255,0.4)", textTransform: "uppercase"
              }}>
                {phase === PHASES.GUESS_NAME ? "🎮 Guess the game" :
                  phase === PHASES.PIN_MAP ? "📍 Find the location" : "📊 Results"}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              {(phase === PHASES.GUESS_NAME || phase === PHASES.PIN_MAP) && (
                <Timer
                  key={phase === PHASES.GUESS_NAME ? `p1-${phase1Key}` : `p2-${phase2Key}`}
                  seconds={phase === PHASES.GUESS_NAME ? PHASE1_TIME : PHASE2_TIME}
                  maxSeconds={phase === PHASES.GUESS_NAME ? PHASE1_TIME : PHASE2_TIME}
                  isActive={phase === PHASES.GUESS_NAME ? phase1TimerActive : phase2TimerActive}
                  onTimeUp={phase === PHASES.GUESS_NAME ? phase1TimeUp : phase2TimeUp}
                />
              )}
              <div style={{
                fontFamily: "'Orbitron', monospace", fontSize: 18,
                fontWeight: 700, color: "#fff"
              }}>
                {score.toLocaleString()}
                <span style={{
                  fontSize: 10, color: "rgba(255,255,255,0.3)",
                  marginLeft: 4
                }}>PTS</span>
              </div>
            </div>
          </div>

          {/* Main content area */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            {/* Phase 1: Panorama + Guess */}
            {phase === PHASES.GUESS_NAME && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ flex: 1, background: "#000" }}>
                  <PanoramaViewer
                    imageUrl={currentRoundData.panorama}
                    isDemo={!currentRoundData.panorama}
                  />
                </div>

                <div style={{
                  padding: "16px 20px", background: "rgba(0,0,0,0.8)",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  animation: "slideUp 0.3s ease"
                }}>
                  {nameCorrect ? (
                    <div style={{
                      textAlign: "center", padding: 10,
                      animation: "correctFlash 0.5s ease"
                    }}>
                      <span style={{
                        fontFamily: "'Orbitron', monospace", fontWeight: 700,
                        fontSize: 20, color: "#00ff88"
                      }}>
                        ✓ CORRECT! — {currentRoundData.game.name}
                      </span>
                    </div>
                  ) : guessesLeft === 0 ? (
                    <div style={{ textAlign: "center", padding: 10 }}>
                      <span style={{
                        fontFamily: "'Orbitron', monospace", fontWeight: 700,
                        fontSize: 18, color: "#ff4444"
                      }}>
                        ✗ It was: {currentRoundData.game.name}
                      </span>
                    </div>
                  ) : (
                    <div style={{
                      display: "flex", gap: 12, alignItems: "center",
                      maxWidth: 700, margin: "0 auto"
                    }}>
                      <input
                        type="text"
                        value={guess}
                        onChange={(e) => setGuess(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && submitGuess()}
                        placeholder="Type the game name..."
                        autoFocus
                      />
                      <button className="btn-primary" onClick={submitGuess}
                        style={{ padding: "14px 24px", whiteSpace: "nowrap" }}>
                        GUESS
                      </button>
                      <div style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                        color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap"
                      }}>
                        {guessesLeft}/{MAX_GUESSES}
                      </div>
                    </div>
                  )}

                  {wrongGuesses.length > 0 && guessesLeft > 0 && (
                    <div style={{
                      display: "flex", gap: 8, justifyContent: "center",
                      marginTop: 10, flexWrap: "wrap"
                    }}>
                      {wrongGuesses.map((wg, i) => (
                        <span key={i} style={{
                          background: "rgba(255,50,50,0.15)", color: "rgba(255,100,100,0.8)",
                          padding: "4px 12px", borderRadius: 4, fontSize: 12,
                          fontFamily: "'JetBrains Mono', monospace",
                          textDecoration: "line-through"
                        }}>
                          {wg}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Phase 2: Map Pinpoint */}
            {phase === PHASES.PIN_MAP && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ flex: 1 }}>
                  <MapPinpoint
                    mapImage={currentRoundData.game.mapImage}
                    game={currentRoundData.game}
                    onPin={setPinPos}
                    pinPos={pinPos}
                    correctPos={null}
                    showCorrect={false}
                    disabled={phase2Confirmed}
                  />
                </div>

                <div style={{
                  padding: "14px 20px", background: "rgba(0,0,0,0.8)",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  animation: "slideUp 0.3s ease"
                }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                    color: "rgba(255,255,255,0.5)"
                  }}>
                    {nameCorrect ? (
                      <span style={{ color: "#00ff88" }}>✓ {currentRoundData.game.name}</span>
                    ) : (
                      <span style={{ color: "#ff6666" }}>✗ {currentRoundData.game.name}</span>
                    )}
                    <span style={{ margin: "0 12px", color: "rgba(255,255,255,0.15)" }}>|</span>
                    Now pinpoint: <span style={{ color: "#fff" }}>{currentRoundData.locationName}</span>
                  </div>
                  <button
                    className="btn-primary"
                    disabled={!pinPos}
                    onClick={confirmPin}
                    style={{ padding: "12px 28px" }}
                  >
                    CONFIRM PIN
                  </button>
                </div>
              </div>
            )}

            {/* Round Result */}
            {phase === PHASES.ROUND_RESULT && lastRoundScore && (
              <div style={{
                display: "flex", height: "100%",
                animation: "fadeIn 0.4s ease"
              }}>
                {/* Map with correct answer */}
                <div style={{ flex: 1 }}>
                  <MapPinpoint
                    mapImage={currentRoundData.game.mapImage}
                    game={currentRoundData.game}
                    onPin={() => { }}
                    pinPos={lastRoundScore.pinPos}
                    correctPos={lastRoundScore.correctPos}
                    showCorrect={true}
                    disabled={true}
                  />
                </div>

                {/* Score panel */}
                <div style={{
                  width: 320, background: "rgba(0,0,0,0.85)",
                  borderLeft: "1px solid rgba(255,255,255,0.06)",
                  padding: 28, display: "flex", flexDirection: "column",
                  justifyContent: "center", gap: 24
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{
                      fontFamily: "'Orbitron', monospace", fontSize: 14,
                      color: "rgba(255,255,255,0.4)", letterSpacing: 3,
                      textTransform: "uppercase", marginBottom: 8
                    }}>
                      Round {currentRound + 1} Result
                    </div>
                    <div style={{
                      fontFamily: "'Orbitron', monospace", fontSize: 42,
                      fontWeight: 900, color: "#00ff88",
                      animation: "scorePopIn 0.5s ease"
                    }}>
                      +{lastRoundScore.total.toLocaleString()}
                    </div>
                  </div>

                  <div style={{
                    display: "flex", flexDirection: "column", gap: 12,
                    background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 16
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                        color: "rgba(255,255,255,0.5)"
                      }}>Game Name</span>
                      <span style={{
                        fontFamily: "'Orbitron', monospace", fontWeight: 700,
                        color: lastRoundScore.nameCorrect ? "#00ff88" : "#ff4444"
                      }}>
                        {lastRoundScore.nameCorrect ? `+${NAME_CORRECT_POINTS}` : "+0"}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                        color: "rgba(255,255,255,0.5)"
                      }}>Map Pin</span>
                      <span style={{
                        fontFamily: "'Orbitron', monospace", fontWeight: 700,
                        color: lastRoundScore.mapPoints > 2000 ? "#00ff88" :
                          lastRoundScore.mapPoints > 500 ? "#ffaa00" : "#ff4444"
                      }}>
                        +{lastRoundScore.mapPoints.toLocaleString()}
                      </span>
                    </div>
                    <div style={{
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      paddingTop: 8, display: "flex", justifyContent: "space-between"
                    }}>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                        color: "rgba(255,255,255,0.4)"
                      }}>Location</span>
                      <span style={{
                        fontFamily: "'Inter', sans-serif", fontSize: 13,
                        color: "rgba(255,255,255,0.8)", textAlign: "right"
                      }}>
                        {lastRoundScore.location}
                      </span>
                    </div>
                  </div>

                  <div style={{
                    textAlign: "center", fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 14, color: "rgba(255,255,255,0.3)"
                  }}>
                    Total: <span style={{ color: "#fff", fontWeight: 700 }}>
                      {score.toLocaleString()}
                    </span> pts
                  </div>

                  <button className="btn-primary" onClick={nextRound} style={{ width: "100%" }}>
                    {currentRound + 1 >= TOTAL_ROUNDS ? "See Final Results" : "Next Round →"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== RESULTS SCREEN ===== */}
      {screen === SCREENS.RESULTS && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100%", padding: 24,
          animation: "fadeIn 0.5s ease", overflow: "auto"
        }}>
          <div style={{
            fontFamily: "'Orbitron', monospace", fontSize: 14,
            color: "rgba(255,255,255,0.3)", letterSpacing: 4,
            textTransform: "uppercase", marginBottom: 12
          }}>
            Game Over
          </div>

          <div style={{
            fontFamily: "'Orbitron', monospace", fontSize: "clamp(48px, 8vw, 72px)",
            fontWeight: 900,
            background: "linear-gradient(135deg, #00ff88, #00ccff)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            animation: "scorePopIn 0.6s ease"
          }}>
            {score.toLocaleString()}
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
            color: "rgba(255,255,255,0.3)", marginBottom: 32
          }}>
            out of {((NAME_CORRECT_POINTS + MAX_MAP_POINTS) * TOTAL_ROUNDS).toLocaleString()} possible
          </div>

          {/* Score breakdown */}
          <div style={{
            width: "100%", maxWidth: 600, background: "rgba(255,255,255,0.03)",
            borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)",
            overflow: "hidden", marginBottom: 24
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "50px 1fr 80px 80px 80px",
              padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1
            }}>
              <span>#</span>
              <span>Game</span>
              <span style={{ textAlign: "right" }}>Name</span>
              <span style={{ textAlign: "right" }}>Map</span>
              <span style={{ textAlign: "right" }}>Total</span>
            </div>
            {roundScores.map((rs, i) => (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: "50px 1fr 80px 80px 80px",
                padding: "10px 16px",
                borderBottom: i < roundScores.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                animation: `slideUp 0.3s ease ${i * 0.05}s both`
              }}>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                  color: "rgba(255,255,255,0.3)"
                }}>
                  {rs.round}
                </span>
                <span style={{
                  fontSize: 13, color: "rgba(255,255,255,0.7)",
                  fontFamily: "'Inter', sans-serif", overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap"
                }}>
                  {rs.game}
                </span>
                <span style={{
                  textAlign: "right", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 13, fontWeight: 600,
                  color: rs.nameCorrect ? "#00ff88" : "#ff4444"
                }}>
                  {rs.namePoints > 0 ? `+${rs.namePoints}` : "0"}
                </span>
                <span style={{
                  textAlign: "right", fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 13, fontWeight: 600,
                  color: rs.mapPoints > 2000 ? "#00ff88" : rs.mapPoints > 500 ? "#ffaa00" : "#ff4444"
                }}>
                  +{rs.mapPoints}
                </span>
                <span style={{
                  textAlign: "right", fontFamily: "'Orbitron', monospace",
                  fontSize: 13, fontWeight: 700, color: "#fff"
                }}>
                  {rs.total.toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn-primary" onClick={startGame}>
              Play Again
            </button>
            <button className="btn-secondary" onClick={() => setScreen(SCREENS.MENU)}>
              Main Menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
