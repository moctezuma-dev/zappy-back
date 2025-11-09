import json
import uuid
import random
from datetime import datetime, timedelta

NOMBRES = [
    ("James Quincey", "The Coca-Cola Company", "Chief Executive Officer"),
    ("Nancy Quan", "The Coca-Cola Company", "Chief Technical Officer"),
    ("Ramon Laguarta", "PepsiCo", "Chairman and CEO"),
    ("Jane Wakely", "PepsiCo", "Chief Consumer and Marketing Officer"),
    ("Andy Jassy", "Amazon", "President and CEO"),
    ("Alicia Boler Davis", "Amazon", "SVP Global Customer Fulfillment"),
    ("Satya Nadella", "Microsoft", "Chairman and CEO"),
    ("Amy Hood", "Microsoft", "Executive Vice President and CFO"),
    ("Sundar Pichai", "Alphabet", "Chief Executive Officer"),
    ("Ruth Porat", "Alphabet", "President and Chief Investment Officer"),
    ("Tim Cook", "Apple", "Chief Executive Officer"),
    ("Katherine Adams", "Apple", "Senior Vice President and General Counsel"),
    ("Mike Sievert", "T-Mobile US", "President and CEO"),
    ("Callie Field", "T-Mobile US", "President Business Group"),
    ("Elon Musk", "Tesla", "Technoking"),
    ("Vaibhav Taneja", "Tesla", "Chief Financial Officer"),
    ("Reed Hastings", "Netflix", "Executive Chairman"),
    ("Greg Peters", "Netflix", "Co-CEO"),
    ("Han Jong-hee", "Samsung Electronics", "Vice Chairman and CEO"),
    ("Park Hark-kyu", "Samsung Electronics", "President and CFO"),
]

DEPARTAMENTOS = [
    "Operaciones", "IT", "Innovación", "Finanzas", "Comercial", "Logística", "Dirección", "Suministro", "Marketing"
]

DEALS = [
    "Global beverage supply optimization program",
    "North America retail analytics deployment",
    "Prime fulfillment automation initiative",
    "Cloud modernization for enterprise productivity",
    "AI-driven customer care rollout",
    "Gigafactory capacity expansion",
    "5G enterprise connectivity bundle",
    "Personalized streaming recommendation engine",
    "Sustainable packaging transformation",
]

KPI_EXAMPLES = [
    ["Revenue growth"],
    ["Operating margin"],
    ["Customer satisfaction"],
    ["Supply chain resilience"],
    ["Network uptime"],
    ["Subscriber retention"]
]

NOTICIAS = [
    "announces strategic partnership with Microsoft on cloud innovation",
    "launches sustainability roadmap aligned with 2030 goals",
    "reports record quarterly earnings above Wall Street expectations",
    "expands manufacturing footprint in North America",
    "introduces new AI-driven customer experience program",
    "secures multiyear sponsorship with global sports league"
]

def genera_usuario(nombre, empresa, rol):
    teammates_pool = [entry for entry in NOMBRES if entry[1] == empresa and entry[0] != nombre]
    if teammates_pool:
        equipo_size = min(len(teammates_pool), random.randint(1, 3))
        equipo = [
            {"id": str(uuid.uuid4()), "nombre": n, "puesto": r}
            for (n, _, r) in random.sample(teammates_pool, k=equipo_size)
        ]
    else:
        equipo = []

    return {
        "id": str(uuid.uuid4()),
        "nombre": nombre,
        "puesto": rol,
        "compañia": empresa,
        "es_cliente": random.choice([True, False]),
        "es_proveedor": random.choice([True, False]),
        "equipo": equipo,
        "a_cargo_de_equipo": random.choice([True, False]),
        "status_tareas": [],
        "notas_personales": f"Prefers to be called {nombre.split()[0]}.",
        "ultimas_interacciones": [
            {
                "fecha": (datetime.now() - timedelta(days=random.randint(0,7))).isoformat(),
                "canal": random.choice(["Email", "WhatsApp", "Llamada"]),
                "participantes": [nombre, random.choice(NOMBRES)[0]],
                "presupuesto": random.randint(8000, 55000),
                "requerimientos": random.choice([
                    "Informe de cumplimiento global",
                    "Plan maestro de cadena de suministro",
                    "Estrategia de sostenibilidad",
                    "Arquitectura de IA generativa"
                ]),
                "kpis": random.choice(KPI_EXAMPLES),
                "datos": {"otro_dato": "Valor mock"},
                "plazo": (datetime.now() + timedelta(days=random.randint(1,20))).strftime("%Y-%m-%d"),
            }
        ]
    }

def genera_tarea(usuario_nombre):
    return {
        "id": str(uuid.uuid4()),
        "titulo": random.choice(DEALS),
        "usuario_responsable": usuario_nombre,
        "estatus": random.choice(["Pendiente", "En proceso", "Terminado"]),
        "requerimientos": random.choice([
            "Auditoría de ciberseguridad",
            "Integración ERP global",
            "Evaluación ESG",
            "Arquitectura de datos unificada"
        ]),
        "kpis": random.choice(KPI_EXAMPLES),
        "plazo": (datetime.now() + timedelta(days=random.randint(2,30))).strftime("%Y-%m-%d"),
        "canal": random.choice(["Email", "WhatsApp", "Llamada"]),
        "presupuesto": random.randint(12000, 80000),
        "notas": random.choice(["Prioridad alta", "Seguimiento semanal"])
    }

def genera_departamento(empresa):
    depto_nombre = random.choice(DEPARTAMENTOS)
    company_contacts = [entry for entry in NOMBRES if entry[1] == empresa]
    if company_contacts:
        sample_size = min(len(company_contacts), random.randint(1, max(1, len(company_contacts))))
        usuarios = [
            genera_usuario(n, empresa, r)
            for (n, _, r) in random.sample(company_contacts, k=sample_size)
        ]
    else:
        usuarios = []
    for usuario in usuarios:
        usuario["status_tareas"] = [genera_tarea(usuario['nombre']) for _ in range(random.randint(1,2))]

    tareas = [genera_tarea(u["nombre"]) for u in usuarios for _ in range(random.randint(1,2))]
    return {
        "nombre": depto_nombre,
        "usuarios": usuarios,
        "tareas": tareas
    }

def genera_empresa(nombre):
    departamentos = [genera_departamento(nombre) for _ in range(random.randint(1,2))]
    data_fresh_collector = [
        {
            "fuente": "Google News",
            "fecha": (datetime.now() - timedelta(days=random.randint(0,10))).strftime("%Y-%m-%d"),
            "noticia": f"{nombre} {random.choice(NOTICIAS)}",
            "tema_relacionado": random.choice(["Automatización", "Finanzas", "Logística"])
        }
        for _ in range(random.randint(1,3))
    ]
    return {
        "empresa": nombre,
        "departamentos": departamentos,
        "data_fresh_collector": data_fresh_collector
    }

if __name__ == "__main__":
    empresas_set = set([e for (_,e,_) in NOMBRES])
    empresas = [genera_empresa(e) for e in empresas_set]
    with open("empresas_mock.json", "w", encoding="utf-8") as f:
        json.dump(empresas, f, ensure_ascii=False, indent=2)
