# MediTurnos — Sistema de Gestión de Turnos Médicos

| Nombre                     | Rol          | GitHub             |
|----------------------------|--------------|--------------------|
| Olivera Juan Cruz          | Scrum Master | @juancruzolivera28 |
| Gomez Borjas Agustina Luz  | Dev Lead     | @agusfaqucp        |
| Fritz Thaiana Ailen        | QA Lead      | @fritzthai         |
| Ibarra Balthazar Cesar     | UX Lead      | @BalthaIbarra      |

## Descripción del proyecto

Proyecto desarrollado eligiendo la opción A: una clínica médica que necesita digitalizar la asignación de turnos médicos. El sistema permite gestionar pacientes, médicos y turnos con roles diferenciados, persistencia en base de datos en la nube y acceso web desde cualquier dispositivo.

🔗 Tablero del proyecto: https://github.com/users/agusfaqucp-cloud/projects/4

🌐 Sistema en producción: https://is2-2026-mediturbo.vercel.app

---

## Caso de uso principal

El paciente ingresa al sistema y selecciona la especialidad, el médico y un horario disponible. El sistema valida los datos y asigna el turno según la lógica correspondiente. Una vez confirmado, el turno se registra y el paciente recibe una notificación. Además, el paciente puede modificar o cancelar el turno, lo que genera una actualización en el sistema y una nueva notificación. Este caso de uso representa la funcionalidad central del sistema, ya que concentra la interacción principal entre el usuario y la gestión de turnos.

---

## Patrones de diseño implementados

**PATRÓN OBSERVER**

Utilizado para el sistema de notificaciones. El turno actúa como Subject y notifica a los observers registrados cada vez que su estado cambia. En el TP Integrador se extendió con una clase que simula el envío de mensajes por WhatsApp/SMS al paciente.

**PATRÓN STRATEGY**

Utilizado para la asignación de turnos. Permite intercambiar algoritmos de asignación sin modificar el gestor de turnos. La implementación actual asigna el médico disponible según la especialidad solicitada.

---

## Stack tecnológico

| Componente | Tecnología |
|---|---|
| Frontend | React 18 |
| Base de datos | Supabase (PostgreSQL) |
| Deploy | Vercel |
| TP1 — escritorio | Java Swing + Maven |
| Pruebas | JUnit 5 + GitHub Actions |

---

## Estructura del repositorio

```
├── mediturnos-web/        → Versión web (React + Supabase)
├── mediturnos/            → Versión escritorio TP1 (Java Swing)
├── pruebas/               → Tests JUnit 5
├── docs/                  → Documentación TP2
└── .github/workflows/     → CI/CD GitHub Actions
```

---

## Mejora Integradora

### ¿Qué se mejoró?

El sistema pasó de ser una aplicación de escritorio en Java Swing con datos guardados en archivos locales a una aplicación web completa con base de datos en la nube, accesible desde cualquier dispositivo y con múltiples usuarios conectados simultáneamente.

Las 10 mejoras implementadas y presentadas al docente son las siguientes:

1. **Notificación simulada WhatsApp/SMS** al confirmar, cancelar o atender un turno — extensión del patrón Observer del TP1
2. **Exportación a Excel** con selector de columnas y filtros antes de descargar — integración con Estadística
3. **Calendario semanal de disponibilidad** con horarios libres y ocupados
4. **Acciones directas desde el calendario** — confirmar, atender o cancelar un turno sin cambiar de pantalla
5. **Motivo de consulta con autocompletado** al marcar un turno como atendido — valor epidemiológico
6. **Motivo de cancelación con autocompletado** — identifica causas frecuentes de cancelación
7. **Fecha de nacimiento del paciente y edad calculada** en la exportación para análisis estadístico
8. **Paciente puede reprogramar su turno** con validación de disponibilidad
9. **Agenda semanal del médico** con vista de 7 días ordenada por hora
10. **Notificaciones en tiempo real** vía Supabase Realtime — todos los usuarios ven los cambios al instante

### Exportación para Estadística

El sistema permite al administrador exportar los datos de turnos a un archivo Excel (.xlsx) seleccionando exactamente qué columnas incluir y aplicando filtros por especialidad, médico, estado y rango de fechas. El archivo incluye la edad calculada del paciente al momento del turno, calculada automáticamente a partir de la fecha de nacimiento.

Este archivo fue utilizado como fuente de datos para el análisis estadístico de la materia Probabilidad y Estadística, donde se estudió la variable edad en relación con la especialidad consultada sobre una muestra de 69 turnos atendidos en el período enero-marzo 2026.

---

## Cómo usar el sistema

Acceder a: **https://is2-2026-mediturbo.vercel.app**

Credenciales de prueba:

| Usuario | Nombre | Apellido | Contraseña | Rol |
|---|---|---|---|---|
| Administrador | admin | admin | 1234 | ADMIN |
| Médico Cardiología | Carlos | Garcia | 1234 | MÉDICO |
| Médico Pediatría | Ana | Lopez | 1234 | MÉDICO |
| Médico Dermatología | Pedro | Martinez | 1234 | MÉDICO |
| Paciente | Juan | Perez | 1234 | PACIENTE |

---

## Ejecutar versión de escritorio (TP1)

```bash
cd mediturnos/src
javac -cp . model\*.java observer\*.java strategy\*.java datos\*.java *.java
java Main
```

## Ejecutar tests (TP2)

```bash
mvn test
```

---

## CI/CD

El repositorio tiene configurado un pipeline en `.github/workflows/test.yml` que ejecuta automáticamente los 6 tests unitarios en cada push a la rama main. El resultado es visible en la pestaña Actions del repositorio.
