import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private mesh: THREE.Mesh | null = null;
  private container: HTMLElement;
  private frameId = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070b);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    this.camera.position.set(1.8, 1.4, 1.8);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 4, 2);
    const fill = new THREE.DirectionalLight(0xffffff, 0.8);
    fill.position.set(-3, -1, -2);
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(key, fill, ambient);

    const grid = new THREE.GridHelper(3, 12, 0x2a2f3a, 0x1a1e27);
    this.scene.add(grid);

    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.animate();
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.renderer.setSize(clientWidth, clientHeight);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }

  private animate = (): void => {
    this.frameId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  setGeometry(geometry: THREE.BufferGeometry): void {
    this.clearMesh();
    const material = new THREE.MeshStandardMaterial({
      color: 0x4f8cff,
      roughness: 0.55,
      metalness: 0.05,
      flatShading: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);
  }

  clearMesh(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
    }
  }

  exportSTL(filename: string): void {
    if (!this.mesh) throw new Error("Kein Modell zum Exportieren vorhanden.");
    const exporter = new STLExporter();
    const result = exporter.parse(this.mesh, { binary: true });
    const blob = new Blob([result.buffer as ArrayBuffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    this.clearMesh();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
