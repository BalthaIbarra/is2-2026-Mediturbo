# MediTurnos — Sistema de Gestión de Turnos Médicos

| Nombre                     | Rol          | GitHub             |
|----------------------------|--------------|--------------------|
| Olivera Juan Cruz          | Scrum Master | @juancruzolivera28 |
| Gomez Borjas Agustina Luz  | Dev Lead     | @agusfaqucp        |
| Fritz Thaiana Ailen        | QA Lead      | @fritzthai         |
| Ibarra Balthazar Cesar     | UX Lead      | @BalthaIbarra      |

## Descripción del proyecto

Proyecto desarrollado eligiendo la opción A: una clínica médica que necesita digitalizar la asignación de turnos médicos. El sistema permite gestionar pacientes, médicos y turnos con roles diferenciados, persistencia en base de datos y acceso web desde cualquier dispositivo.

🔗 Tablero del proyecto: https://github.com/users/agusfaqucp-cloud/projects/4

🌐 Sistema en producción: https://is2-2026-mediturbo.vercel.app

---

## Caso de uso principal

El paciente ingresa al sistema y selecciona la especialidad, el médico y un horario disponible. El sistema valida los datos y asigna el turno según la lógica correspondiente. Una vez confirmado, el turno se registra y el paciente recibe una notificación. Además, el paciente puede modificar o cancelar el turno, lo que genera una actualización en el sistema y una nueva notificación. Este caso de uso representa la funcionalidad central del sistema, ya que concentra la interacción principal entre el usuario y la gestión de turnos.

---

## Patrones de diseño implementados

### Patrón Observer
Utilizado para el sistema de notificaciones. El `Turno` actúa como Subject y notifica a los observers registrados cada vez que su estado cambia (PENDIENTE → CONFIRMADO → ATENDIDO / CANCELADO). En el TP Integrador se extendió con la clase `ServicioNotificacionWA` que simula el envío de mensajes por WhatsApp/SMS.

### Patrón Strategy
Utilizado para la asignación de turnos. La interfaz `EstrategiaAsignacion` permite intercambiar algoritmos de asignación sin modificar el `GestorTurnos`. La implementación actual es `AsignacionPorDisponibilidad`, que asigna el médico disponible según la especialidad solicitada.

---

## Stack tecnológico

| Componente | Tecnología |
|---|---|
| Frontend | React 18 |
| Base de datos | Supabase (PostgreSQL) |
| Deploy | Vercel |
| TP1 (escritorio) | Java Swing + Maven |
| Pruebas | JUnit 5 + GitHub Actions |

---

## Estructura del repositorio

```
├── mediturnos-web/        → Versión web (React + Supabase)
│   ├── src/
│   │   ├── App.jsx        → Componente principal con toda la lógica
│   │   ├── App.css        → Estilos
│   │   └── supabase.js    → Configuración de la base de datos
│   └── package.json
├── mediturnos/            → Versión escritorio TP1 (Java Swing)
│   └── src/
├── pruebas/               → Tests JUnit 5
├── docs/                  → Documentación TP2
└── .github/workflows/     → CI/CD GitHub Actions
```

---

## Mejora Integradora

### ¿Qué se mejoró?

Para el TP Integrador se implementaron dos mejoras principales sobre el sistema existente:

**1. Notificación simulada WhatsApp/SMS (extensión del patrón Observer)**

El sistema ya tenía el patrón Observer del TP1. Se extendió con la clase `ServicioNotificacionWA` que, cada vez que un turno cambia de estado, construye un mensaje personalizado y lo muestra en una burbuja visual que simula WhatsApp. El mensaje incluye el nombre del paciente, el médico asignado, la especialidad y la fecha del turno.

En producción, el único cambio necesario para enviar mensajes reales sería conectar el método `enviar()` a la API de Twilio o WhatsApp Business API, sin modificar el resto del sistema.

```javascript
class ServicioNotificacionWA {
  actualizar(turno, evento) {
    const msg = this._construirMensaje(turno, evento)
    this.historial.push({ msg, ts: new Date().toLocaleTimeString() })
    return msg
  }
  _construirMensaje(turno, evento) {
    const base = `Hola ${turno.nombre} ${turno.apellido}`
    if (evento === 'CONFIRMADO')
      return `${base}, su turno con ${turno.medico} (${turno.especialidad}) para el ${turno.fecha} fue CONFIRMADO.`
    if (evento === 'CANCELADO')
      return `${base}, su turno del ${turno.fecha} fue CANCELADO. Puede reprogramarlo ingresando al sistema.`
    if (evento === 'ATENDIDO')
      return `${base}, gracias por su visita. Su turno del ${turno.fecha} fue registrado como ATENDIDO.`
  }
}
```

**2. Exportación de datos a Excel para integración con Estadística**

Se implementó la función `generarExcel()` usando SheetJS que genera un archivo `.xlsx` real. Antes de descargar, el sistema muestra un popup con:
- Selector de columnas (paciente, edad calculada, DNI, obra social, especialidad, médico, estado, fecha, motivo de consulta, motivo de cancelación)
- Filtros por especialidad, médico, estado y rango de fechas
- Contador de registros a exportar

El archivo incluye la edad calculada automáticamente a partir de la fecha de nacimiento del paciente al momento del turno, dato fundamental para el análisis estadístico.

### Otras funcionalidades agregadas en el integrador

- Calendario semanal de disponibilidad con horarios libres y ocupados
- Acciones directas desde el calendario (confirmar, atender, cancelar)
- Motivo de consulta con autocompletado inteligente (guardado en Supabase)
- Motivo de cancelación con autocompletado
- Fecha de nacimiento del paciente
- Paciente puede cancelar y reprogramar su propio turno
- Búsqueda de paciente por DNI con autocompletado de datos
- Agenda semanal del médico
- Dashboard de bienvenida con resumen del día
- Notificaciones en tiempo real vía Supabase Realtime
- Filtrado estricto por rol en todas las vistas
- Diseño responsive para mobile

### Script de exportación para Estadística

La exportación se realiza desde el panel del administrador en el sistema web:

1. Iniciar sesión con `admin / admin / 1234`
2. En el menú lateral hacer clic en **Exportar Excel**
3. Seleccionar las columnas y filtros deseados
4. Hacer clic en **Descargar Excel (.xlsx)**

El archivo generado tiene la siguiente estructura:

```
Paciente | Edad | DNI | Obra Social | Especialidad | Medico | Estado | Fecha turno | Motivo consulta | Motivo cancelacion
```

Ejemplo de las primeras 5 líneas:

```
Ramon Espinoza  | 70 | 18234567 | OSDE          | Cardiologia     | Dr. Garcia   | ATENDIDO | 03/01/2026 09:00 | Control de hipertension |
Graciela Ibañez | 73 | 21789012 | PAMI          | Cardiologia     | Dr. Garcia   | ATENDIDO | 05/01/2026 10:30 | Arritmia cardiaca       |
Lucia Garcia    | 35 | 35678901 | OSDE          | Clinica General | Dr. Ramirez  | ATENDIDO | 04/01/2026 09:00 | Gripe y fiebre          |
Camila Flores   | 23 | 45678901 | OSDE          | Dermatologia    | Dr. Martinez | ATENDIDO | 06/01/2026 09:00 | Acne severo             |
Carlos Romero   | 74 | 12456789 | Swiss Medical | Cardiologia     | Dr. Garcia   | ATENDIDO | 05/01/2026 10:30 | Control de stent        |
```

---

## Cómo ejecutar el proyecto

### Versión web (recomendada)

Acceder directamente a: **https://is2-2026-mediturbo.vercel.app**

Credenciales de prueba:
- Admin: `admin / admin / 1234`
- Médico Cardiología: `Carlos / Garcia / 1234`
- Médico Pediatría: `Ana / Lopez / 1234`
- Médico Dermatología: `Pedro / Martinez / 1234`
- Paciente: `Juan / Perez / 1234`

### Versión escritorio (TP1)

```bash
cd mediturnos/src
javac -cp . model\*.java observer\*.java strategy\*.java datos\*.java *.java
java Main
```

### Tests (TP2)

```bash
mvn test
```

---

## CI/CD

El repositorio tiene configurado un pipeline de GitHub Actions en `.github/workflows/test.yml` que ejecuta automáticamente los 6 tests unitarios en cada push a main. El resultado es visible en la pestaña Actions del repositorio.
