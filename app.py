"""
CassavaGuard — Cassava Leaf Disease Diagnostic Platform
FastAPI backend with ResNet50 + custom FC head inference.
"""

import io
import os
from pathlib import Path
import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

# ── Config ──────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = Path(os.environ.get("MODEL_PATH", str(BASE_DIR / "model" / "model_inference.pth")))
NUM_CLASSES = 5
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

CLASS_NAMES = [
    "Bacterial Blight",
    "Brown Streak Disease",
    "Green Mottle",
    "Healthy",
    "Mosaic Disease",
]

CLASS_INDEX_MAP = {
    "Cassava___bacterial_blight": 0,
    "Cassava___brown_streak_disease": 1,
    "Cassava___green_mottle": 2,
    "Cassava___healthy": 3,
    "Cassava___mosaic_disease": 4,
}

CLASS_META = {
    "Bacterial Blight": {
        "abbr": "CBB",
        "severity": "Critical",
        "description": "A systemic vascular disease caused by Xanthomonas axonopodis pv. manihotis. The pathogen enters through stomata or wounds in the leaves, colonizes vascular tissues, and leads to wilting and plant death.",
        "symptoms": [
            "Angular water-soaked leaf spots",
            "Leaf wilting and stem dieback",
            "Gum exudation on stems",
            "Vascular browning in cross-sections",
        ],
        "actions": [
            "Remove and destroy infected plants immediately",
            "Use certified disease-free planting materials",
            "Apply copper-based bactericides preventively",
            "Implement strict quarantine for new cuttings",
        ],
    },
    "Brown Streak Disease": {
        "abbr": "CBSD",
        "severity": "High",
        "description": "Caused by Cassava brown streak viruses (CBSVs), transmitted by whiteflies. It causes root necrosis that makes tubers unmarketable, with yield losses up to 70%.",
        "symptoms": [
            "Yellow or necrotic vein banding on leaves",
            "Brown streaks on green stems",
            "Dry brown-black necrotic patches in roots",
            "Pitting and constriction of roots",
        ],
        "actions": [
            "Plant CBSD-tolerant varieties",
            "Control whitefly populations",
            "Remove symptomatic plants early",
            "Use virus-indexed planting material",
        ],
    },
    "Green Mottle": {
        "abbr": "CGM",
        "severity": "Moderate",
        "description": "Caused by Cassava green mottle virus, leading to chlorotic mottling patterns on leaves. While less destructive than CMD, it can reduce photosynthetic efficiency and yield.",
        "symptoms": [
            "Green-yellow mosaic mottling on leaves",
            "Mild leaf distortion",
            "Reduced leaf size in severe cases",
            "Stunted growth in young plants",
        ],
        "actions": [
            "Use virus-free planting material",
            "Monitor and rogue infected plants",
            "Control insect vectors",
            "Maintain field hygiene",
        ],
    },
    "Healthy": {
        "abbr": "HLT",
        "severity": "None",
        "description": "The leaf shows no visible signs of disease or pest damage. Healthy cassava leaves are deep green, fully expanded, and free from spots, mottling, or deformations.",
        "symptoms": [],
        "actions": [
            "Continue regular crop monitoring",
            "Maintain proper nutrition and irrigation",
            "Practice crop rotation",
            "Keep field free from weed hosts",
        ],
    },
    "Mosaic Disease": {
        "abbr": "CMD",
        "severity": "Critical",
        "description": "The most widespread and damaging cassava disease in Africa, caused by cassava mosaic geminiviruses (CMGs) transmitted by whiteflies. Can cause yield losses of 20-95%.",
        "symptoms": [
            "Chlorotic yellow-green mosaic patterns",
            "Leaf curling and distortion",
            "Reduced leaf size and plant stunting",
            "Misshapen and twisted leaflets",
        ],
        "actions": [
            "Plant CMD-resistant varieties",
            "Use clean planting materials from certified sources",
            "Control whitefly vector populations",
            "Remove and burn infected plants promptly",
        ],
    },
}

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

inference_transform = transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])

# ── Model ───────────────────────────────────────────────────────
def load_model():
    net = models.resnet50(weights=None)
    in_features = net.fc.in_features  # 2048
    # Exact FC head from checkpoint:
    # fc.0=BN(2048), fc.1=ReLU, fc.2=Linear(2048,512),
    # fc.3=ReLU, fc.4=BN(512), fc.5=Dropout, fc.6=Linear(512,5)
    net.fc = nn.Sequential(
        nn.BatchNorm1d(in_features),
        nn.ReLU(inplace=True),
        nn.Linear(in_features, 512),
        nn.ReLU(inplace=True),
        nn.BatchNorm1d(512),
        nn.Dropout(0.3),
        nn.Linear(512, NUM_CLASSES),
    )
    if MODEL_PATH.exists():
        print(f"Loading model from: {MODEL_PATH}")
        try:
            ckpt = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=False)
            # Checkpoint is a dict with 'model_state_dict' key
            if isinstance(ckpt, dict) and "model_state_dict" in ckpt:
                state = ckpt["model_state_dict"]
            elif isinstance(ckpt, dict) and "state_dict" in ckpt:
                state = ckpt["state_dict"]
            else:
                state = ckpt
            net.load_state_dict(state)
            print("Model loaded successfully.")
        except Exception as e:
            print(f"ERROR loading model: {e}")
    else:
        print(f"WARNING: Model not found at {MODEL_PATH} — running in demo mode (random weights)")
    net.to(DEVICE)
    net.eval()
    return net

model = load_model()

# ── App ─────────────────────────────────────────────────────────
app = FastAPI(title="CassavaGuard", version="2.0.0")

STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/healthz")
@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/")
async def index():
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded.")
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read image. Please upload a valid JPG, PNG, or WEBP file.")
    tensor = inference_transform(img).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        outputs = model(tensor)
        probs = torch.softmax(outputs, dim=1)[0]

    probs_list = probs.cpu().tolist()
    pred_idx = int(probs.argmax())
    pred_class = CLASS_NAMES[pred_idx]
    confidence = probs_list[pred_idx]

    distribution = []
    for i, name in enumerate(CLASS_NAMES):
        distribution.append({"class": name, "probability": round(probs_list[i] * 100, 2)})
    distribution.sort(key=lambda x: x["probability"], reverse=True)

    meta = CLASS_META[pred_class]

    return JSONResponse({
        "prediction": pred_class,
        "abbreviation": meta["abbr"],
        "confidence": round(confidence * 100, 2),
        "severity": meta["severity"],
        "description": meta["description"],
        "symptoms": meta["symptoms"],
        "actions": meta["actions"],
        "distribution": distribution,
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
