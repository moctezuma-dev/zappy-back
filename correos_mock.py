import json
import uuid
import random
from datetime import datetime, timedelta

NOMBRES = [
    ("Sofía Ramírez", "Innovar Group", "Gerente de Compras"),
    ("Marco Gómez", "TecGlobal", "Director de IT"),
    ("Valeria Torres", "Constructora Taurus", "Jefa de Proyectos"),
    ("Roberto Sánchez", "SaludExpress", "Coordinador Médico"),
    ("Laura Jiménez", "Finanzas Next", "Analista Senior"),
    ("Juan Torres", "Energía Verde", "Gerente Comercial"),
    ("Ana López", "ModaFutura", "Encargada de Sourcing"),
    ("Patricia Peña", "TechSmart", "CEO"),
    ("Esteban Ruiz", "Farmasur", "Líder Logístico"),
    ("Carla Díaz", "Alimentos Brisa", "Compras Internacionales"),
]

DEPARTAMENTOS = [
    "Compras", "IT", "Proyectos", "Finanzas", "Comercial", "Logística", "Dirección", "Sourcing", "Médico"
]

DEALS = [
    "Soluciones de automatización en la nube",
    "Servicios logísticos integrales",
    "Software ERP especializado",
    "Consultoría estratégica",
    "Plataforma de marketing digital",
    "Diseño y fabricación de mobiliario",
    "Suministro de materiales",
    "Outsourcing de soporte técnico",
    "Implementación de blockchain",
]

KPI_EXAMPLES = [["Entrega a tiempo"], ["Reducción de costos"], ["Mejorar servicio"], ["Satisfacción cliente"]]

NOTICIAS = [
    "Lanza nueva división de IA",
    "Premio de innovación 2025",
    "Firma alianza internacional",
    "Expansión de operaciones en Latinoamérica"
]

def genera_usuario(nombre, empresa, rol):
    return {
        "id": str(uuid.uuid4()),
        "nombre": nombre,
        "puesto": rol,
        "compañia": empresa,
        "es_cliente": random.choice([True, False]),
        "es_proveedor": random.choice([True, False]),
        "equipo": [
            {"id": str(uuid.uuid4()), "nombre": n, "puesto": r}
            for (n, e, r) in random.sample(NOMBRES, k=random.randint(1,3)) if e == empresa
        ],
        "a_cargo_de_equipo": random.choice([True, False]),
        "status_tareas": [],
        "notas_personales": f"Prefiere ser llamado/a {nombre.split()[0]}.",
        "ultimas_interacciones": [
            {
                "fecha": (datetime.now() - timedelta(days=random.randint(0,7))).isoformat(),
                "canal": random.choice(["Email", "WhatsApp", "Llamada"]),
                "participantes": [nombre, random.choice(NOMBRES)[0]],
                "presupuesto": random.randint(8000, 55000),
                "requerimientos": random.choice(["Informe detallado", "Cotización formal", "Plan de trabajo"]),
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
        "requerimientos": random.choice(["Documentación actualizada", "Revisión legal", "Integración ERP"]),
        "kpis": random.choice(KPI_EXAMPLES),
        "plazo": (datetime.now() + timedelta(days=random.randint(2,30))).strftime("%Y-%m-%d"),
        "canal": random.choice(["Email", "WhatsApp", "Llamada"]),
        "presupuesto": random.randint(12000, 80000),
        "notas": random.choice(["Prioridad alta", "Seguimiento semanal"])
    }

def genera_departamento(empresa):
    depto_nombre = random.choice(DEPARTAMENTOS)
    usuarios = [
        genera_usuario(n, empresa, r)
        for (n, e, r) in random.sample(NOMBRES, k=random.randint(1,4)) if e == empresa
    ]
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
