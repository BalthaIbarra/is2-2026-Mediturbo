import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
         PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import './App.css'

const ESPECIALIDADES = ['Cardiologia', 'Pediatria', 'Dermatologia', 'Clinica General']
const HORAS = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00',
               '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto',
               'Septiembre','Octubre','Noviembre','Diciembre']
const MEDICO_MAP = { Cardiologia:'Dr. Garcia', Pediatria:'Dra. Lopez', Dermatologia:'Dr. Martinez', 'Clinica General':'Dr. Ramirez' }
const USUARIOS_DEFAULT = [
  { nombre:'admin',  apellido:'admin',    contrasena:'1234', rol:'ADMIN',    especialidad:'' },
  { nombre:'Carlos', apellido:'Garcia',   contrasena:'1234', rol:'MEDICO',   especialidad:'Cardiologia' },
  { nombre:'Ana',    apellido:'Lopez',    contrasena:'1234', rol:'MEDICO',   especialidad:'Pediatria' },
  { nombre:'Pedro',  apellido:'Martinez', contrasena:'1234', rol:'MEDICO',   especialidad:'Dermatologia' },
  { nombre:'Juan',   apellido:'Perez',    contrasena:'1234', rol:'PACIENTE', especialidad:'' },
  { nombre:'Maria',  apellido:'Gomez',    contrasena:'1234', rol:'PACIENTE', especialidad:'' },
]

// ── OBSERVER: ServicioNotificacion ──────────────────────────────────────────
class ServicioNotificacionWA {
  constructor() { this.historial = [] }
  actualizar(turno, evento) {
    const msg = this._construirMensaje(turno, evento)
    this.historial.push({ msg, ts: new Date().toLocaleTimeString() })
    return msg
  }
  _construirMensaje(turno, evento) {
    const base = `Hola ${turno.nombre} ${turno.apellido}`
    if (evento === 'CONFIRMADO')
      return `${base}, su turno con ${turno.medico} (${turno.especialidad}) para el ${turno.fecha} fue CONFIRMADO. Centro Medico Cuenca Del Plata.`
    if (evento === 'CANCELADO')
      return `${base}, su turno del ${turno.fecha} fue CANCELADO. Puede reprogramarlo ingresando al sistema.`
    if (evento === 'ATENDIDO')
      return `${base}, gracias por su visita. Su turno del ${turno.fecha} fue registrado como ATENDIDO.`
    return `${base}, su turno ha sido actualizado a: ${evento}.`
  }
}
const notificadorWA = new ServicioNotificacionWA()

// ── EXPORTAR CSV ─────────────────────────────────────────────────────────────
function generarExcel(turnos, opciones) {
  const cols = []
  if (opciones.id)              cols.push(['ID',                  t => t.id])
  if (opciones.paciente)        cols.push(['Paciente',            t => `${t.nombre} ${t.apellido}`])
  if (opciones.edad)            cols.push(['Edad',                t => calcularEdad(t.fecha_nacimiento, t.fecha)])
  if (opciones.fechaNacimiento) cols.push(['Fecha nacimiento',    t => t.fecha_nacimiento || ''])
  if (opciones.dni)             cols.push(['DNI',                 t => t.dni || ''])
  if (opciones.obraSocial)      cols.push(['Obra social',         t => t.obra_social || ''])
  if (opciones.especialidad)    cols.push(['Especialidad',        t => t.especialidad || ''])
  if (opciones.medico)          cols.push(['Medico',              t => t.medico || ''])
  if (opciones.estado)          cols.push(['Estado',              t => t.estado || ''])
  if (opciones.fecha)           cols.push(['Fecha turno',         t => t.fecha || ''])
  if (opciones.motivoConsulta)  cols.push(['Motivo consulta',     t => t.motivo_consulta || ''])
  if (opciones.motivoCancelacion) cols.push(['Motivo cancelacion',t => t.motivo_cancelacion || ''])
  if (opciones.creadoPor)       cols.push(['Creado por',          t => t.creado_por || ''])

  const headers = cols.map(c => c[0])
  const rows    = turnos.map(t => cols.map(c => c[1](t)))
  const wsData  = [headers, ...rows]

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Ancho de columnas automatico
  ws['!cols'] = headers.map((h, i) => {
    const maxLen = Math.max(h.length, ...rows.map(r => String(r[i] || '').length))
    return { wch: Math.min(maxLen + 2, 40) }
  })

  XLSX.utils.book_append_sheet(wb, ws, 'Turnos')
  XLSX.writeFile(wb, `mediturnos_estadistica_${new Date().toISOString().slice(0,10)}.xlsx`)
}

function calcularEdad(fechaNac, fechaTurno) {
  if (!fechaNac) return ''
  try {
    const [d, m, a] = fechaNac.split('/').map(Number)
    const nacimiento = new Date(a, m - 1, d)
    const ref = fechaTurno ? new Date(fechaTurno.split(' ')[0].split('/').reverse().join('-')) : new Date()
    let edad = ref.getFullYear() - nacimiento.getFullYear()
    const cumple = new Date(ref.getFullYear(), nacimiento.getMonth(), nacimiento.getDate())
    if (ref < cumple) edad--
    return isNaN(edad) ? '' : edad
  } catch { return '' }
}

// ── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [sesion, setSesion]           = useState(null)
  const [pantalla, setPantalla]       = useState('login')
  const [turnos, setTurnos]           = useState([])
  const [todosLosTurnos, setTodosLosTurnos] = useState([])
  const [usuarios, setUsuarios]       = useState([])
  const [cargando, setCargando]       = useState(false)
  const [notif, setNotif]             = useState(null)
  const [modal, setModal]             = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const mostrarNotif = (msg, tipo = 'ok') => {
    setNotif({ msg, tipo })
    setTimeout(() => setNotif(null), 3500)
  }

  const filtrarTurnos = (data, u) => {
    if (!u || u.rol === 'ADMIN') return data
    if (u.rol === 'MEDICO') return data.filter(t =>
      t.medico?.toLowerCase().includes(u.apellido.toLowerCase()) &&
      t.especialidad?.toLowerCase() === u.especialidad?.toLowerCase()
    )
    return data.filter(t =>
      t.nombre?.toLowerCase() === u.nombre.toLowerCase() &&
      t.apellido?.toLowerCase() === u.apellido.toLowerCase()
    )
  }

  const cargarTurnos = useCallback(async (u) => {
    const { data } = await supabase.from('turnos').select('*').order('id', { ascending: true })
    if (data) {
      setTodosLosTurnos(data)
      setTurnos(filtrarTurnos(data, u))
    }
  }, [])

  const cargarUsuarios = useCallback(async () => {
    const { data } = await supabase.from('usuarios').select('*')
    if (!data || data.length === 0) {
      await supabase.from('usuarios').insert(USUARIOS_DEFAULT)
      setUsuarios(USUARIOS_DEFAULT)
    } else setUsuarios(data)
  }, [])

  useEffect(() => { cargarUsuarios() }, [cargarUsuarios])

  useEffect(() => {
    if (!sesion) return
    const channel = supabase.channel('turnos-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos' }, () => {
        cargarTurnos(sesion)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [sesion, cargarTurnos])

  const login = async (nombre, apellido, pass) => {
    setCargando(true)
    const { data } = await supabase.from('usuarios').select('*')
    const u = (data || []).find(u =>
      u.nombre.toLowerCase() === nombre.toLowerCase() &&
      u.apellido.toLowerCase() === apellido.toLowerCase() &&
      u.contrasena === pass
    )
    if (!u) { mostrarNotif('Datos incorrectos', 'error'); setCargando(false); return }
    setSesion(u)
    await cargarTurnos(u)
    setPantalla('panel')
    setCargando(false)
  }

  const cerrarSesion = () => { setSesion(null); setPantalla('login'); setTurnos([]) }

  const crearTurno = async (datos) => {
    const { nombre, apellido, dni, obraSocial, especialidad, fecha } = datos
    const solapado = todosLosTurnos.find(t =>
      t.especialidad?.toLowerCase() === especialidad.toLowerCase() &&
      t.fecha === fecha && t.estado !== 'CANCELADO'
    )
    if (solapado) { mostrarNotif('Ese horario ya esta ocupado', 'error'); return false }
    const fechaNac = (datos.diaNac && datos.mesNac && datos.anioNac)
      ? `${datos.diaNac}/${datos.mesNac}/${datos.anioNac}` : null
    const nuevo = {
      nombre, apellido, dni, obra_social: obraSocial,
      especialidad, medico: MEDICO_MAP[especialidad] || 'Sin asignar',
      estado: 'PENDIENTE', fecha,
      fecha_nacimiento: fechaNac,
      creado_por: sesion.nombre + ' ' + sesion.apellido
    }
    const { error } = await supabase.from('turnos').insert([nuevo])
    if (error) { mostrarNotif('Error al crear turno', 'error'); return false }
    await cargarTurnos(sesion)
    mostrarNotif('Turno registrado correctamente')
    return true
  }

  const cambiarEstado = async (turno, nuevoEstado, motivo, motivoConsulta) => {
    const update = { estado: nuevoEstado }
    if (motivo) update.motivo_cancelacion = motivo
    if (motivoConsulta) update.motivo_consulta = motivoConsulta
    await supabase.from('turnos').update(update).eq('id', turno.id)
    await cargarTurnos(sesion)
    mostrarNotif('Estado actualizado')
    if (['CONFIRMADO','CANCELADO','ATENDIDO'].includes(nuevoEstado)) {
      const msg = notificadorWA.actualizar(turno, nuevoEstado)
      setModal(<NotifWAMock msg={msg} paciente={`${turno.nombre} ${turno.apellido}`} evento={nuevoEstado} />)
    }
  }

  const reprogramarTurno = async (turno, nuevaFecha) => {
    const solapado = todosLosTurnos.find(t =>
      t.id !== turno.id &&
      t.especialidad?.toLowerCase() === turno.especialidad.toLowerCase() &&
      t.fecha === nuevaFecha && t.estado !== 'CANCELADO'
    )
    if (solapado) { mostrarNotif('Ese horario ya esta ocupado', 'error'); return false }
    await supabase.from('turnos').update({ fecha: nuevaFecha }).eq('id', turno.id)
    await cargarTurnos(sesion)
    mostrarNotif('Turno reprogramado correctamente')
    return true
  }

  const registrarUsuario = async (datos) => {
    const existe = usuarios.find(u =>
      u.nombre.toLowerCase() === datos.nombre.toLowerCase() &&
      u.apellido.toLowerCase() === datos.apellido.toLowerCase()
    )
    if (existe) { mostrarNotif('Ya existe ese usuario', 'error'); return false }
    await supabase.from('usuarios').insert([datos])
    await cargarUsuarios()
    mostrarNotif('Usuario registrado')
    return true
  }

  const eliminarUsuario = async (id, nombre) => {
    if (nombre === 'admin') { mostrarNotif('No se puede eliminar el admin', 'error'); return }
    await supabase.from('usuarios').delete().eq('id', id)
    await cargarUsuarios()
    mostrarNotif('Usuario eliminado')
  }

  const buscarPacientePorDni = async (dni) => {
    if (!dni || dni.length < 7) return null
    const { data } = await supabase.from('turnos')
      .select('nombre,apellido,obra_social').eq('dni', dni).limit(1)
    return data?.[0] || null
  }

  return (
    <div className="app">
      {notif && <Notificacion notif={notif} />}
      {modal && <Modal modal={modal} setModal={setModal} />}
      {pantalla === 'login' && <Login onLogin={login} cargando={cargando} />}
      {pantalla === 'panel' && sesion && (
        <Panel
          sesion={sesion} turnos={turnos} todosLosTurnos={todosLosTurnos}
          usuarios={usuarios} onCerrarSesion={cerrarSesion}
          onCrearTurno={crearTurno} onCambiarEstado={cambiarEstado}
          onReprogramar={reprogramarTurno} onRegistrarUsuario={registrarUsuario}
          onEliminarUsuario={eliminarUsuario} setModal={setModal}
          mostrarNotif={mostrarNotif} buscarDni={buscarPacientePorDni}
          sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
          onExportarCSV={() => setModal(<ExportarExcelModal turnos={todosLosTurnos} />)}
        />
      )}
    </div>
  )
}

// ── NOTIF WA MOCK ─────────────────────────────────────────────────────────────
function NotifWAMock({ msg, paciente, evento }) {
  const colores = { CONFIRMADO:'#25d366', CANCELADO:'#be2d2d', ATENDIDO:'#1e64b9' }
  return (
    <div>
      <div className="wa-header" style={{ background: colores[evento] || '#25d366' }}>
        <span className="wa-icono">📱</span>
        <span>Notificacion simulada — WhatsApp / SMS</span>
      </div>
      <div className="wa-body">
        <div className="wa-burbuja">
          <div className="wa-pac">Para: {paciente}</div>
          <p>{msg}</p>
          <div className="wa-hora">{new Date().toLocaleTimeString()} ✓✓</div>
        </div>
      </div>
      <div className="wa-nota">
        En produccion este mensaje se enviaria via Twilio API o WhatsApp Business API.
        El patron Observer ya esta preparado para conectarse a cualquier proveedor.
      </div>
    </div>
  )
}

function Notificacion({ notif }) {
  return (
    <div className={`notif notif-${notif.tipo}`}>
      {notif.tipo === 'ok' ? '✓' : '✕'} {notif.msg}
    </div>
  )
}

function Modal({ modal, setModal }) {
  return (
    <div className="modal-overlay" onClick={() => setModal(null)}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        {modal}
        <button className="btn-cerrar-modal" onClick={() => setModal(null)}>Cerrar</button>
      </div>
    </div>
  )
}

function Login({ onLogin, cargando }) {
  const [nombre, setNombre]     = useState('')
  const [apellido, setApellido] = useState('')
  const [pass, setPass]         = useState('')
  return (
    <div className="login-wrap">
      <div className="login-left">
        <div className="login-logo">+</div>
        <h2 className="login-centro">Centro Medico<br /><strong>Cuenca Del Plata</strong></h2>
        <p className="login-sub">Atencion medica de excelencia</p>
      </div>
      <div className="login-right">
        <h1 className="login-titulo">Iniciar sesion</h1>
        <p className="login-subtitulo">Sistema de gestion de turnos</p>
        <div className="login-sep" />
        <form onSubmit={e => { e.preventDefault(); onLogin(nombre, apellido, pass) }} className="login-form">
          <label>Nombre</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre" required />
          <label>Apellido</label>
          <input value={apellido} onChange={e => setApellido(e.target.value)} placeholder="Apellido" required />
          <label>Contrasena</label>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••" required />
          <button type="submit" className="btn-login" disabled={cargando}>
            {cargando ? 'Ingresando...' : 'Ingresar al sistema'}
          </button>
        </form>
        <p className="login-hint">admin / admin / 1234</p>
      </div>
    </div>
  )
}

function Panel({ sesion, turnos, todosLosTurnos, usuarios, onCerrarSesion, onCrearTurno,
  onCambiarEstado, onReprogramar, onRegistrarUsuario, onEliminarUsuario,
  setModal, mostrarNotif, buscarDni, sidebarOpen, setSidebarOpen, onExportarCSV }) {

  const [vistaActual, setVistaActual] = useState('dashboard')
  const [turnoSel, setTurnoSel]       = useState(null)
  const esAdmin   = sesion.rol === 'ADMIN'
  const esMedico  = sesion.rol === 'MEDICO'
  const esPaciente= sesion.rol === 'PACIENTE'

  const pend = turnos.filter(t => t.estado === 'PENDIENTE').length
  const conf = turnos.filter(t => t.estado === 'CONFIRMADO').length
  const aten = turnos.filter(t => t.estado === 'ATENDIDO').length

  const abrirNuevoTurno = (fechaPreset) => {
    setSidebarOpen(false)
    setModal(
      <FormNuevoTurno sesion={sesion} todosLosTurnos={todosLosTurnos} buscarDni={buscarDni}
        fechaPreset={fechaPreset}
        onCrear={async (datos) => { const ok = await onCrearTurno(datos); if (ok) setModal(null) }} />
    )
  }

  const abrirCancelarConMotivo = (turno) => {
    setModal(<FormCancelar turno={turno} onCancelar={async (motivo) => {
      await onCambiarEstado(turno, 'CANCELADO', motivo)
      setTurnoSel(null)
    }} />)
  }

  const abrirReprogramar = (turno) => {
    setModal(<FormReprogramar turno={turno} todosLosTurnos={todosLosTurnos}
      onReprogramar={async (nuevaFecha) => {
        const ok = await onReprogramar(turno, nuevaFecha)
        if (ok) setModal(null)
      }} />)
  }

  const navegar = (vista) => { setVistaActual(vista); setSidebarOpen(false) }

  const accionEstado = (nuevoEstado) => {
    if (!turnoSel) { mostrarNotif('Selecciona un turno', 'error'); return }
    if (nuevoEstado === 'CANCELADO') { abrirCancelarConMotivo(turnoSel); return }
    if (nuevoEstado === 'ATENDIDO') {
      setModal(<FormAtender turno={turnoSel} onAtender={async (motivoConsulta) => {
        await onCambiarEstado(turnoSel, 'ATENDIDO', null, motivoConsulta)
        setTurnoSel(null)
      }} />)
      return
    }
    onCambiarEstado(turnoSel, nuevoEstado)
    setTurnoSel(null)
  }

  return (
    <div className="panel-wrap">
      <header className="panel-header">
        <div className="header-izq">
          <button className="burger" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
          <div className="header-icono">+</div>
          <div className="header-txt">
            <div className="header-nombre">MediTurnos — Centro Medico Cuenca Del Plata</div>
            <div className="header-usuario">{sesion.nombre} {sesion.apellido} [{sesion.rol}]</div>
          </div>
        </div>
        <div className="header-contadores">
          <div className="contador"><span className="cnt-num amarillo">{pend}</span><span className="cnt-lbl">PENDIENTES</span></div>
          <div className="contador"><span className="cnt-num verde">{conf}</span><span className="cnt-lbl">CONFIRMADOS</span></div>
          <div className="contador"><span className="cnt-num azul">{aten}</span><span className="cnt-lbl">ATENDIDOS</span></div>
        </div>
      </header>

      <div className="panel-body">
        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
        <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <div className="sidebar-label">Menu</div>
          <SideBtn label="Dashboard"        color="dorado"  onClick={() => navegar('dashboard')}    activo={vistaActual==='dashboard'} />
          <SideBtn label="Nuevo turno"      color="dorado"  onClick={() => abrirNuevoTurno(null)} />
          <SideBtn label="Disponibilidad"   color="azul2"   onClick={() => navegar('calendario')}   activo={vistaActual==='calendario'} />

          {(esAdmin || esMedico) && <>
            <SideBtn label="Confirmar"       color="verde"  onClick={() => accionEstado('CONFIRMADO')} />
            <SideBtn label="Marcar atendido" color="azul"   onClick={() => accionEstado('ATENDIDO')} />
            <SideBtn label="Cancelar"        color="rojo"   onClick={() => accionEstado('CANCELADO')} />
            <div className="sidebar-sep" />
            <SideBtn label="Mis turnos"      color="gris"   onClick={() => navegar('turnos')}       activo={vistaActual==='turnos'} />
            <SideBtn label="Gestion"         color="azul2"  onClick={() => navegar('gestion')}      activo={vistaActual==='gestion'} />
            {esMedico && <SideBtn label="Agenda"       color="violeta" onClick={() => navegar('agenda')} activo={vistaActual==='agenda'} />}
            <SideBtn label="Estadisticas"    color="violeta" onClick={() => navegar('estadisticas')} activo={vistaActual==='estadisticas'} />
          </>}

          {esPaciente && <>
            <div className="sidebar-sep" />
            <SideBtn label="Mis turnos"      color="gris"   onClick={() => navegar('turnos')}       activo={vistaActual==='turnos'} />
            {turnoSel?.estado === 'PENDIENTE' && <>
              <SideBtn label="Cancelar turno"  color="rojo"   onClick={() => abrirCancelarConMotivo(turnoSel)} />
              <SideBtn label="Reprogramar"     color="violeta" onClick={() => abrirReprogramar(turnoSel)} />
            </>}
          </>}

          {esAdmin && <>
            <SideBtn label="Usuarios"        color="azul"   onClick={() => navegar('usuarios')}     activo={vistaActual==='usuarios'} />
            <SideBtn label="Exportar Excel"    color="verde"  onClick={onExportarCSV} />
          </>}
          <div className="sidebar-sep" />
          <SideBtn label="Cerrar sesion"     color="rojo"   onClick={onCerrarSesion} />
        </aside>

        <main className="panel-main">
          {vistaActual === 'dashboard'    && <Dashboard sesion={sesion} turnos={turnos} onNuevoTurno={abrirNuevoTurno} />}
          {vistaActual === 'turnos'       && <TablaTurnos turnos={turnos} turnoSel={turnoSel} setTurnoSel={setTurnoSel}
                                              titulo="Mis Turnos" esPaciente={esPaciente}
                                              onCancelar={abrirCancelarConMotivo}
                                              onReprogramar={abrirReprogramar}
                                              onVerHistorial={(t) => setModal(<HistorialPaciente turno={t} turnos={turnos} />)} />}
          {vistaActual === 'gestion'      && <GestionTurnos turnos={turnos}
                                              onVerHistorial={(t) => setModal(<HistorialPaciente turno={t} turnos={turnos} />)} />}
          {vistaActual === 'calendario'   && <CalendarioDisponibilidad todosLosTurnos={todosLosTurnos}
                                              sesion={sesion}
                                              onNuevoTurno={abrirNuevoTurno}
                                              onTurnoCalendario={(t) => setModal(<PopupTurnoCalendario
                                                turno={t}
                                                onConfirmar={() => { onCambiarEstado(t,'CONFIRMADO'); setModal(null) }}
                                                onAtender={() => setModal(<FormAtender turno={t} onAtender={async(mc) => { await onCambiarEstado(t,'ATENDIDO',null,mc); setModal(null) }} />)}
                                                onCancelar={() => setModal(<FormCancelar turno={t} onCancelar={async(m) => { await onCambiarEstado(t,'CANCELADO',m); setModal(null) }} />)}
                                              />)} />}
          {vistaActual === 'agenda'       && esMedico && <AgendaMedico turnos={turnos} sesion={sesion} />}
          {vistaActual === 'estadisticas' && <Estadisticas turnos={turnos} />}
          {vistaActual === 'usuarios'     && esAdmin && <GestionUsuarios usuarios={usuarios}
                                              onRegistrar={onRegistrarUsuario} onEliminar={onEliminarUsuario} />}
        </main>

        <aside className="notif-panel">
          <div className="notif-header">Notificaciones <span className="notif-tag">● Observer</span></div>
          {turnos.slice(-10).reverse().map((t, i) => (
            <div key={i} className={`notif-item ${i===0?'notif-first':''}`}>
              <EstadoSemaforo estado={t.estado} />
              <div>
                <span className="notif-pac">{t.nombre} {t.apellido}</span>
                <span className={`badge badge-${t.estado?.toLowerCase()}`}>{t.estado}</span>
              </div>
            </div>
          ))}
          {turnos.length === 0 && <div className="notif-vacio">Sin actividad</div>}
        </aside>
      </div>

      <footer className="panel-footer">
        <span>MediTurnos v1.0 — Centro Medico Cuenca Del Plata</span>
        <span className="footer-pat">Patrones: Strategy + Observer</span>
      </footer>
    </div>
  )
}

function EstadoSemaforo({ estado }) {
  const colores = { PENDIENTE:'#e6a020', CONFIRMADO:'#3cba6e', CANCELADO:'#e05050', ATENDIDO:'#5aaaf0' }
  return <span className="semaforo" style={{ background: colores[estado] || '#aaa' }} />
}

function SideBtn({ label, color, onClick, activo }) {
  return <button className={`side-btn side-${color} ${activo?'side-activo':''}`} onClick={onClick}>{label}</button>
}

// ── CALENDARIO DE DISPONIBILIDAD ─────────────────────────────────────────────
function CalendarioDisponibilidad({ todosLosTurnos, sesion, onNuevoTurno, onTurnoCalendario }) {
  const esMedico = sesion?.rol === 'MEDICO'
  const turnosFiltrados = esMedico
    ? todosLosTurnos.filter(t =>
        t.medico?.toLowerCase().includes(sesion.apellido.toLowerCase()) &&
        t.especialidad?.toLowerCase() === sesion.especialidad?.toLowerCase()
      )
    : todosLosTurnos
  const [espSel, setEspSel]     = useState(esMedico && sesion?.especialidad ? sesion.especialidad : 'Cardiologia')
  const [semanaOffset, setSemana] = useState(0)

  const hoy = new Date()
  const diasSemana = Array.from({length:7}, (_, i) => {
    const d = new Date(hoy)
    d.setDate(hoy.getDate() + semanaOffset * 7 + i)
    return d
  })

  const estaOcupado = (dia, hora) => {
    const str = `${String(dia.getDate()).padStart(2,'0')}/${String(dia.getMonth()+1).padStart(2,'0')}/${dia.getFullYear()} ${hora}`
    return turnosFiltrados.some(t =>
      t.especialidad?.toLowerCase() === espSel.toLowerCase() &&
      t.fecha === str && t.estado !== 'CANCELADO'
    )
  }

  const diasNombre = ['Dom','Lun','Mar','Mie','Jue','Vie','Sab']

  return (
    <div className="tabla-wrap fade-in">
      <div className="cal-header">
        <h2 className="tabla-titulo" style={{border:0,padding:0}}>Disponibilidad semanal</h2>
        <div className="cal-controles">
          <select value={espSel} onChange={e => setEspSel(e.target.value)} className="cal-esp-sel" disabled={esMedico}>
            {ESPECIALIDADES.map(e => <option key={e}>{e}</option>)}
          </select>
          <button className="btn-nav" onClick={() => setSemana(s => s - 1)}>← Anterior</button>
          <button className="btn-nav" onClick={() => setSemana(0)}>Hoy</button>
          <button className="btn-nav" onClick={() => setSemana(s => s + 1)}>Siguiente →</button>
        </div>
      </div>

      <div className="cal-grid">
        <div className="cal-hora-col">
          <div className="cal-dia-header" />
          {HORAS.map(h => <div key={h} className="cal-hora-label">{h}</div>)}
        </div>
        {diasSemana.map((dia, di) => {
          const esHoy = dia.toDateString() === hoy.toDateString()
          return (
            <div key={di} className={`cal-dia-col ${esHoy ? 'cal-hoy' : ''}`}>
              <div className="cal-dia-header">
                <span className="cal-dia-nombre">{diasNombre[dia.getDay()]}</span>
                <span className="cal-dia-num">{dia.getDate()}/{dia.getMonth()+1}</span>
              </div>
              {HORAS.map(hora => {
                const ocupado = estaOcupado(dia, hora)
                const pasado  = dia < new Date(hoy.setHours(0,0,0,0))
                return (
                  <div key={hora}
                    className={`cal-celda ${ocupado ? 'cal-ocupado' : pasado ? 'cal-pasado' : 'cal-libre'}`}
                    onClick={() => {
                      if (pasado) return
                      const fechaStr = `${String(dia.getDate()).padStart(2,'0')}/${String(dia.getMonth()+1).padStart(2,'0')}/${dia.getFullYear()}`
                      if (ocupado) {
                        const turnoEnCelda = turnosFiltrados.find(t =>
                          t.especialidad?.toLowerCase() === espSel.toLowerCase() &&
                          t.fecha === `${fechaStr} ${hora}` && t.estado !== 'CANCELADO'
                        )
                        if (turnoEnCelda) onTurnoCalendario(turnoEnCelda)
                      } else {
                        onNuevoTurno({ fecha: fechaStr, hora, especialidad: espSel })
                      }
                    }}
                    title={ocupado ? 'Ver turno' : 'Clic para reservar'}
                  >
                    {ocupado ? '●' : ''}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      <div className="cal-leyenda">
        <span className="cal-ley-item"><span className="cal-dot libre" />Libre</span>
        <span className="cal-ley-item"><span className="cal-dot ocupado" />Ocupado</span>
        <span className="cal-ley-item"><span className="cal-dot pasado" />Pasado</span>
      </div>
    </div>
  )
}

// ── FORMULARIO CANCELAR CON MOTIVO ───────────────────────────────────────────
function FormCancelar({ turno, onCancelar }) {
  return (
    <div>
      <h2 className="form-titulo">Cancelar turno</h2>
      <p className="form-sub">Turno de <strong>{turno.nombre} {turno.apellido}</strong> — {turno.fecha}</p>
      <CampoAutocompletado
        tipo="cancelacion"
        label="Motivo de cancelacion"
        placeholder="Escribi el motivo..."
        onConfirmar={onCancelar}
        btnLabel="Confirmar cancelacion"
        btnColor="#be2d2d"
      />
    </div>
  )
}

// ── FORMULARIO REPROGRAMAR ────────────────────────────────────────────────────
function FormReprogramar({ turno, todosLosTurnos, onReprogramar }) {
  const hoy  = new Date()
  const anio = hoy.getFullYear()
  const dias  = Array.from({length:31}, (_,i) => String(i+1).padStart(2,'0'))
  const [dia, setDia]   = useState(String(hoy.getDate()).padStart(2,'0'))
  const [mes, setMes]   = useState(String(hoy.getMonth()+1).padStart(2,'0'))
  const [hora, setHora] = useState('08:00')

  const horaOcupada = h => {
    const fh = `${dia}/${mes}/${anio} ${h}`
    return todosLosTurnos.some(t =>
      t.id !== turno.id &&
      t.especialidad?.toLowerCase() === turno.especialidad.toLowerCase() &&
      t.fecha === fh && t.estado !== 'CANCELADO'
    )
  }

  return (
    <div>
      <h2 className="form-titulo">Reprogramar turno</h2>
      <p className="form-sub">Turno actual: <strong>{turno.fecha}</strong> — {turno.especialidad}</p>
      <div className="form-grid" style={{marginTop:16}}>
        <div className="form-field">
          <label>Dia</label>
          <select value={dia} onChange={e => setDia(e.target.value)}>
            {dias.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Mes</label>
          <select value={mes} onChange={e => setMes(e.target.value)}>
            {MESES.map((m,i) => <option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Hora</label>
          <select value={hora} onChange={e => setHora(e.target.value)}>
            {HORAS.map(h => <option key={h} value={h} disabled={horaOcupada(h)}>{h}{horaOcupada(h)?' [OCUPADO]':''}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Año</label>
          <input value={anio} readOnly style={{background:'#f0f4fb',color:'#888'}} />
        </div>
      </div>
      <button className="btn-crear-turno" style={{marginTop:8}}
        onClick={() => onReprogramar(`${dia}/${mes}/${anio} ${hora}`)}>
        Confirmar reprogramacion
      </button>
    </div>
  )
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ sesion, turnos, onNuevoTurno }) {
  const hoy    = new Date()
  const hoyStr = `${String(hoy.getDate()).padStart(2,'0')}/${String(hoy.getMonth()+1).padStart(2,'0')}/${hoy.getFullYear()}`
  const turnosHoy = turnos.filter(t => t.fecha?.startsWith(hoyStr))
  const pend      = turnos.filter(t => t.estado === 'PENDIENTE')
  const prox      = turnos.filter(t => ['PENDIENTE','CONFIRMADO'].includes(t.estado)).slice(0,5)

  return (
    <div className="dashboard fade-in">
      <div className="dash-bienvenida">
        <div>
          <h2 className="dash-titulo">Bienvenido, {sesion.nombre} {sesion.apellido}</h2>
          <p className="dash-sub">{sesion.rol} — {hoy.toLocaleDateString('es-AR',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
        </div>
        <button className="btn-nuevo-dash" onClick={() => onNuevoTurno(null)}>+ Nuevo Turno</button>
      </div>
      <div className="dash-cards">
        <DashCard titulo="Turnos hoy"  valor={turnosHoy.length} color="#1e64b9" icono="📅" />
        <DashCard titulo="Pendientes"  valor={pend.length}      color="#c8821e" icono="⏳" />
        <DashCard titulo="Total"       valor={turnos.length}    color="#228b50" icono="📋" />
        <DashCard titulo="Atendidos"   valor={turnos.filter(t=>t.estado==='ATENDIDO').length} color="#6030a0" icono="✓" />
      </div>
      {prox.length > 0 && (
        <div className="dash-prox">
          <h3 className="dash-sec-titulo">Proximos turnos</h3>
          <div className="dash-prox-lista">
            {prox.map((t,i) => (
              <div key={i} className="dash-prox-item">
                <EstadoSemaforo estado={t.estado} />
                <div className="dash-prox-fecha">{t.fecha}</div>
                <div className="dash-prox-pac">{t.nombre} {t.apellido}</div>
                <div className="dash-prox-esp">{t.especialidad}</div>
                <span className={`badge badge-${t.estado?.toLowerCase()}`}>{t.estado}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DashCard({ titulo, valor, color, icono }) {
  return (
    <div className="dash-card" style={{borderTop:`4px solid ${color}`}}>
      <span className="dash-card-icono">{icono}</span>
      <span className="dash-card-num" style={{color}}>{valor}</span>
      <span className="dash-card-lbl">{titulo}</span>
    </div>
  )
}

function AgendaMedico({ turnos }) {
  const hoy = new Date()
  const diasSemana = Array.from({length:7}, (_,i) => { const d=new Date(hoy); d.setDate(hoy.getDate()+i); return d })
  const diasNombre = ['Dom','Lun','Mar','Mie','Jue','Vie','Sab']
  const turnosPorDia = (fecha) => {
    const str = `${String(fecha.getDate()).padStart(2,'0')}/${String(fecha.getMonth()+1).padStart(2,'0')}/${fecha.getFullYear()}`
    return turnos.filter(t => t.fecha?.startsWith(str)).sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''))
  }
  return (
    <div className="tabla-wrap fade-in">
      <h2 className="tabla-titulo">Agenda — Proximos 7 dias</h2>
      <div className="agenda-grid">
        {diasSemana.map((dia,i) => {
          const ts = turnosPorDia(dia)
          return (
            <div key={i} className={`agenda-dia ${i===0?'agenda-hoy':''}`}>
              <div className="agenda-dia-header">
                <span className="agenda-dia-nombre">{diasNombre[dia.getDay()]}</span>
                <span className="agenda-dia-num">{dia.getDate()}</span>
              </div>
              {ts.length===0
                ? <div className="agenda-vacio">Libre</div>
                : ts.map((t,j) => (
                  <div key={j} className={`agenda-turno agenda-${t.estado?.toLowerCase()}`}>
                    <div className="agenda-hora">{t.fecha?.split(' ')[1]}</div>
                    <div className="agenda-pac">{t.nombre} {t.apellido}</div>
                    <span className={`badge badge-${t.estado?.toLowerCase()}`}>{t.estado}</span>
                  </div>
                ))
              }
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HistorialPaciente({ turno, turnos }) {
  const historial = turnos.filter(t =>
    t.nombre?.toLowerCase() === turno.nombre?.toLowerCase() &&
    t.apellido?.toLowerCase() === turno.apellido?.toLowerCase()
  )
  return (
    <div>
      <h2 className="form-titulo">Historial de {turno.nombre} {turno.apellido}</h2>
      <p style={{color:'#888',fontSize:13,marginBottom:16}}>DNI: {turno.dni||'-'} | Obra social: {turno.obra_social||'-'}</p>
      <table className="tabla">
        <thead><tr><th>#</th><th>Especialidad</th><th>Medico</th><th>Estado</th><th>Fecha</th><th>Motivo cancel.</th></tr></thead>
        <tbody>
          {historial.map((t,i) => (
            <tr key={i} className={`fila-${t.estado?.toLowerCase()}`}>
              <td>{i+1}</td><td>{t.especialidad}</td><td>{t.medico}</td>
              <td><span className={`badge badge-${t.estado?.toLowerCase()}`}>{t.estado}</span></td>
              <td>{t.fecha}</td><td>{t.motivo_cancelacion||'-'}</td>
            </tr>
          ))}
          {historial.length===0 && <tr><td colSpan="6" className="tabla-vacia">Sin historial</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function TablaTurnos({ turnos, turnoSel, setTurnoSel, titulo, esPaciente, onCancelar, onReprogramar, onVerHistorial }) {
  return (
    <div className="tabla-wrap fade-in">
      {titulo && <h2 className="tabla-titulo">{titulo}</h2>}
      <div className="tabla-scroll">
        <table className="tabla">
          <thead>
            <tr>
              <th>#</th><th>Est.</th><th>Paciente</th><th>DNI</th><th>Obra Social</th>
              <th>Especialidad</th><th>Medico</th><th>Estado</th><th>Fecha</th>
              {esPaciente && <th>Acciones</th>}
              {onVerHistorial && !esPaciente && <th>Historial</th>}
            </tr>
          </thead>
          <tbody>
            {turnos.map((t,i) => (
              <tr key={t.id}
                className={`fila-${t.estado?.toLowerCase()} ${turnoSel?.id===t.id?'fila-sel':''} fade-row`}
                style={{animationDelay:`${i*0.03}s`}}
                onClick={() => setTurnoSel && setTurnoSel(turnoSel?.id===t.id ? null : t)}>
                <td>{i+1}</td>
                <td><EstadoSemaforo estado={t.estado} /></td>
                <td><strong>{t.nombre} {t.apellido}</strong></td>
                <td>{t.dni||'-'}</td>
                <td>{t.obra_social||'-'}</td>
                <td>{t.especialidad}</td>
                <td>{t.medico}</td>
                <td><span className={`badge badge-${t.estado?.toLowerCase()}`}>{t.estado}</span></td>
                <td>{t.fecha}</td>
                {esPaciente && (
                  <td onClick={e => e.stopPropagation()}>
                    {t.estado === 'PENDIENTE' && <>
                      <button className="btn-accion verde" onClick={() => onReprogramar(t)}>Reprogramar</button>
                      <button className="btn-accion rojo"  onClick={() => onCancelar(t)}>Cancelar</button>
                    </>}
                  </td>
                )}
                {onVerHistorial && !esPaciente && (
                  <td><button className="btn-hist" onClick={e => { e.stopPropagation(); onVerHistorial(t) }}>Ver</button></td>
                )}
              </tr>
            ))}
            {turnos.length===0 && <tr><td colSpan="10" className="tabla-vacia">No hay turnos registrados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GestionTurnos({ turnos, onVerHistorial }) {
  const [filtroFecha,  setFiltroFecha]  = useState('')
  const [filtroMedico, setFiltroMedico] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const filtrados = turnos.filter(t => {
    const mF = !filtroFecha  || t.fecha?.includes(filtroFecha)
    const mM = !filtroMedico || t.medico?.toLowerCase().includes(filtroMedico.toLowerCase())
    const mE = filtroEstado==='Todos' || t.estado===filtroEstado
    return mF && mM && mE
  })
  return (
    <div className="tabla-wrap fade-in">
      <h2 className="tabla-titulo">Gestion de Turnos</h2>
      <div className="filtros">
        <input placeholder="Fecha" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} />
        <input placeholder="Medico" value={filtroMedico} onChange={e => setFiltroMedico(e.target.value)} />
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          {['Todos','PENDIENTE','CONFIRMADO','CANCELADO','ATENDIDO'].map(e => <option key={e}>{e}</option>)}
        </select>
        <button className="btn-limpiar" onClick={() => { setFiltroFecha(''); setFiltroMedico(''); setFiltroEstado('Todos') }}>Limpiar</button>
      </div>
      <TablaTurnos turnos={filtrados} onVerHistorial={onVerHistorial} />
    </div>
  )
}

function Estadisticas({ turnos }) {
  const pend = turnos.filter(t => t.estado==='PENDIENTE').length
  const conf = turnos.filter(t => t.estado==='CONFIRMADO').length
  const canc = turnos.filter(t => t.estado==='CANCELADO').length
  const aten = turnos.filter(t => t.estado==='ATENDIDO').length

  // Datos para torta de estados
  const dataTorta = [
    { name: 'Pendiente',  value: pend, color: '#c8821e' },
    { name: 'Confirmado', value: conf, color: '#228b50' },
    { name: 'Cancelado',  value: canc, color: '#be2d2d' },
    { name: 'Atendido',   value: aten, color: '#6030a0' },
  ].filter(d => d.value > 0)

  // Datos para barras por especialidad
  const espMap = {}
  turnos.forEach(t => { espMap[t.especialidad] = (espMap[t.especialidad]||0) + 1 })
  const dataEsp = Object.entries(espMap).map(([esp, cnt]) => ({ especialidad: esp, turnos: cnt }))
    .sort((a,b) => b.turnos - a.turnos)

  // Edad promedio por especialidad
  const edadPorEsp = {}
  const cntPorEsp  = {}
  turnos.forEach(t => {
    if (!t.fecha_nacimiento || !t.fecha) return
    const [d,m,a] = t.fecha_nacimiento.split('/').map(Number)
    const nac = new Date(a, m-1, d)
    const ref = new Date(t.fecha.split(' ')[0].split('/').reverse().join('-'))
    let edad = ref.getFullYear() - nac.getFullYear()
    if (ref < new Date(ref.getFullYear(), nac.getMonth(), nac.getDate())) edad--
    if (!isNaN(edad) && edad > 0) {
      edadPorEsp[t.especialidad] = (edadPorEsp[t.especialidad]||0) + edad
      cntPorEsp[t.especialidad]  = (cntPorEsp[t.especialidad]||0) + 1
    }
  })
  const dataEdad = Object.entries(edadPorEsp).map(([esp, suma]) => ({
    especialidad: esp,
    'Edad promedio': Math.round(suma / cntPorEsp[esp])
  })).sort((a,b) => b['Edad promedio'] - a['Edad promedio'])

  // Turnos por mes
  const mesMap = {}
  turnos.forEach(t => {
    if (!t.fecha) return
    const partes = t.fecha.split(' ')[0].split('/')
    if (partes.length < 3) return
    const mes = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(partes[1])-1]
    if (mes) mesMap[mes] = (mesMap[mes]||0) + 1
  })
  const dataMes = Object.entries(mesMap).map(([mes, cnt]) => ({ mes, turnos: cnt }))

  const LABEL = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
    const RADIAN = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    return percent > 0.04 ? (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
        {`${(percent*100).toFixed(0)}%`}
      </text>
    ) : null
  }

  return (
    <div className="stats-wrap fade-in">
      <h2 className="tabla-titulo">Estadísticas del sistema</h2>

      {/* Tarjetas resumen */}
      <div className="stats-cards">
        <StatCard label="TOTAL"      valor={turnos.length} color="#1e64b9" />
        <StatCard label="PENDIENTE"  valor={pend}          color="#c8821e" />
        <StatCard label="CONFIRMADO" valor={conf}          color="#228b50" />
        <StatCard label="CANCELADO"  valor={canc}          color="#be2d2d" />
        <StatCard label="ATENDIDO"   valor={aten}          color="#6030a0" />
      </div>

      <div className="charts-grid">

        {/* Torta de estados */}
        <div className="chart-box">
          <h3 className="chart-titulo">Distribución por estado</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={dataTorta} cx="50%" cy="50%" outerRadius={90}
                dataKey="value" labelLine={false} label={LABEL}>
                {dataTorta.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [v + ' turnos', n]} />
              <Legend iconType="circle" iconSize={10} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Barras por especialidad */}
        <div className="chart-box">
          <h3 className="chart-titulo">Turnos por especialidad</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dataEsp} margin={{top:10,right:20,left:0,bottom:30}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8eef8" />
              <XAxis dataKey="especialidad" tick={{fontSize:11}} angle={-15} textAnchor="end" />
              <YAxis tick={{fontSize:11}} />
              <Tooltip />
              <Bar dataKey="turnos" fill="#1e64b9" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Edad promedio por especialidad */}
        {dataEdad.length > 0 && (
          <div className="chart-box">
            <h3 className="chart-titulo">Edad promedio por especialidad</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dataEdad} margin={{top:10,right:20,left:0,bottom:30}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8eef8" />
                <XAxis dataKey="especialidad" tick={{fontSize:11}} angle={-15} textAnchor="end" />
                <YAxis tick={{fontSize:11}} domain={[0, 90]} />
                <Tooltip formatter={(v) => [v + ' años', 'Edad promedio']} />
                <Bar dataKey="Edad promedio" radius={[4,4,0,0]}>
                  {dataEdad.map((entry, i) => {
                    const colores = ['#1e3a6e','#2e6da4','#5b9bd5','#be9b5a']
                    return <Cell key={i} fill={colores[i % colores.length]} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Turnos por mes */}
        {dataMes.length > 0 && (
          <div className="chart-box">
            <h3 className="chart-titulo">Turnos por mes</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dataMes} margin={{top:10,right:20,left:0,bottom:10}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8eef8" />
                <XAxis dataKey="mes" tick={{fontSize:11}} />
                <YAxis tick={{fontSize:11}} />
                <Tooltip />
                <Bar dataKey="turnos" fill="#be9b5a" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

      </div>
    </div>
  )
}

function StatCard({ label, valor, color }) {
  return (
    <div className="stat-card">
      <span className="stat-num" style={{color}}>{valor}</span>
      <span className="stat-lbl">{label}</span>
    </div>
  )
}

function GestionUsuarios({ usuarios, onRegistrar, onEliminar }) {
  const [form, setForm] = useState({nombre:'',apellido:'',contrasena:'',rol:'MEDICO',especialidad:'Cardiologia'})
  const submit = async e => {
    e.preventDefault()
    const ok = await onRegistrar(form)
    if (ok) setForm({nombre:'',apellido:'',contrasena:'',rol:'MEDICO',especialidad:'Cardiologia'})
  }
  return (
    <div className="tabla-wrap fade-in">
      <h2 className="tabla-titulo">Gestion de Usuarios</h2>
      <form className="form-usuario" onSubmit={submit}>
        <input placeholder="Nombre"    value={form.nombre}    onChange={e => setForm({...form,nombre:e.target.value})} required />
        <input placeholder="Apellido"  value={form.apellido}  onChange={e => setForm({...form,apellido:e.target.value})} required />
        <input placeholder="Contrasena" value={form.contrasena} onChange={e => setForm({...form,contrasena:e.target.value})} required />
        <select value={form.rol} onChange={e => setForm({...form,rol:e.target.value})}>
          <option>MEDICO</option><option>PACIENTE</option><option>ADMIN</option>
        </select>
        {form.rol==='MEDICO' && (
          <select value={form.especialidad} onChange={e => setForm({...form,especialidad:e.target.value})}>
            {ESPECIALIDADES.map(e => <option key={e}>{e}</option>)}
          </select>
        )}
        <button type="submit" className="btn-registrar">Registrar</button>
      </form>
      <table className="tabla">
        <thead><tr><th>Nombre</th><th>Apellido</th><th>Rol</th><th>Especialidad</th><th></th></tr></thead>
        <tbody>
          {usuarios.map((u,i) => (
            <tr key={i} className="fade-row" style={{animationDelay:`${i*0.03}s`}}>
              <td>{u.nombre}</td><td>{u.apellido}</td>
              <td><span className={`badge badge-rol-${u.rol?.toLowerCase()}`}>{u.rol}</span></td>
              <td>{u.especialidad||'-'}</td>
              <td>{u.nombre!=='admin' && <button className="btn-eliminar" onClick={() => onEliminar(u.id,u.nombre)}>Eliminar</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FormNuevoTurno({ sesion, todosLosTurnos, onCrear, buscarDni, fechaPreset }) {
  const esPaciente = sesion.rol==='PACIENTE'
  const esMedico   = sesion.rol==='MEDICO'
  const hoy  = new Date()
  const anio = hoy.getFullYear()
  const dias  = Array.from({length:31},(_,i) => String(i+1).padStart(2,'0'))
  const [form, setForm] = useState({
    nombre:    esPaciente ? sesion.nombre   : '',
    apellido:  esPaciente ? sesion.apellido : '',
    dni:'', obraSocial:'',
    especialidad: fechaPreset?.especialidad || (esMedico ? sesion.especialidad : 'Cardiologia'),
    dia:  fechaPreset?.fecha?.split('/')[0] || String(hoy.getDate()).padStart(2,'0'),
    mes:  fechaPreset?.fecha?.split('/')[1] || String(hoy.getMonth()+1).padStart(2,'0'),
    hora: fechaPreset?.hora || '08:00'
  })
  const [buscandoDni, setBuscandoDni] = useState(false)
  const fechaHora = `${form.dia}/${form.mes}/${anio} ${form.hora}`
  const horaOcupada = h => {
    const fh = `${form.dia}/${form.mes}/${anio} ${h}`
    return todosLosTurnos.some(t =>
      t.especialidad?.toLowerCase()===form.especialidad.toLowerCase() &&
      t.fecha===fh && t.estado!=='CANCELADO'
    )
  }
  const handleDni = async val => {
    const v = val.replace(/\D/g,'').slice(0,8)
    setForm(f => ({...f, dni:v}))
    if (v.length >= 7) {
      setBuscandoDni(true)
      const enc = await buscarDni(v)
      if (enc) setForm(f => ({...f, dni:v, nombre:enc.nombre, apellido:enc.apellido, obraSocial:enc.obra_social||''}))
      setBuscandoDni(false)
    }
  }
  const submit = async e => {
    e.preventDefault()
    if (form.dni && (form.dni.length<7||form.dni.length>8)) { alert('DNI debe tener 7 u 8 numeros'); return }
    if (horaOcupada(form.hora)) { alert('Ese horario ya esta ocupado'); return }
    await onCrear({...form, fecha:fechaHora, obraSocial:form.obraSocial})
  }
  return (
    <form className="form-turno" onSubmit={submit}>
      <h2 className="form-titulo">Nuevo Turno</h2>
      <div className="form-grid">
        <div className="form-field">
          <label>DNI {buscandoDni && <span className="dni-buscando">buscando...</span>}</label>
          <input value={form.dni} onChange={e => handleDni(e.target.value)} placeholder="Ingresa el DNI primero" />
        </div>
        <div className="form-field">
          <label>Obra Social</label>
          <input value={form.obraSocial} onChange={e => setForm({...form,obraSocial:e.target.value})} />
        </div>
        <div className="form-field">
          <label>Nombre</label>
          <input value={form.nombre} onChange={e => setForm({...form,nombre:e.target.value})} readOnly={esPaciente} required />
        </div>
        <div className="form-field">
          <label>Apellido</label>
          <input value={form.apellido} onChange={e => setForm({...form,apellido:e.target.value})} readOnly={esPaciente} required />
        </div>
        <div className="form-field">
          <label>Especialidad</label>
          <select value={form.especialidad} onChange={e => setForm({...form,especialidad:e.target.value})} disabled={esMedico}>
            {ESPECIALIDADES.map(e => <option key={e}>{e}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Hora</label>
          <select value={form.hora} onChange={e => setForm({...form,hora:e.target.value})}>
            {HORAS.map(h => <option key={h} value={h} disabled={horaOcupada(h)}>{h}{horaOcupada(h)?' [OCUPADO]':''}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Dia</label>
          <select value={form.dia} onChange={e => setForm({...form,dia:e.target.value})}>
            {dias.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Mes / Año</label>
          <div style={{display:'flex',gap:8}}>
            <select value={form.mes} onChange={e => setForm({...form,mes:e.target.value})} style={{flex:1}}>
              {MESES.map((m,i) => <option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
            </select>
            <input value={anio} readOnly style={{width:70,background:'#f0f4fb',color:'#888'}} />
          </div>
        </div>
        <div className="form-field" style={{gridColumn:'1/-1'}}>
          <label>Fecha de nacimiento del paciente</label>
          <div style={{display:'flex',gap:8}}>
            <select value={form.diaNac||''} onChange={e => setForm({...form,diaNac:e.target.value})} style={{flex:1}}>
              <option value="">Dia</option>
              {dias.map(d => <option key={d}>{d}</option>)}
            </select>
            <select value={form.mesNac||''} onChange={e => setForm({...form,mesNac:e.target.value})} style={{flex:2}}>
              <option value="">Mes</option>
              {MESES.map((m,i) => <option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
            </select>
            <input placeholder="Año (ej: 1990)" value={form.anioNac||''} onChange={e => setForm({...form,anioNac:e.target.value.replace(/\D/g,'').slice(0,4)})} style={{flex:1}} />
          </div>
        </div>
      </div>
      <button type="submit" className="btn-crear-turno">Registrar Turno</button>
    </form>
  )
}

// ── CAMPO AUTOCOMPLETADO (cancelacion y consulta) ─────────────────────────────
function CampoAutocompletado({ tipo, label, placeholder, onConfirmar, btnLabel, btnColor }) {
  const [valor, setValor]         = useState('')
  const [sugerencias, setSuger]   = useState([])
  const [mostrarSug, setMostrar]  = useState(false)

  useEffect(() => {
    const cargar = async () => {
      const { data } = await supabase.from('motivos').select('texto').eq('tipo', tipo).order('texto')
      if (data) setSuger(data.map(d => d.texto))
    }
    cargar()
  }, [tipo])

  const guardarYConfirmar = async () => {
    if (!valor.trim()) { alert('Escribi un motivo'); return }
    const existe = sugerencias.includes(valor.trim())
    if (!existe) {
      await supabase.from('motivos').insert([{ texto: valor.trim(), tipo }])
    }
    onConfirmar(valor.trim())
  }

  const filtradas = sugerencias.filter(s => s.toLowerCase().includes(valor.toLowerCase()) && s !== valor)

  return (
    <div style={{marginTop:16}}>
      <div className="form-field">
        <label>{label}</label>
        <div style={{position:'relative'}}>
          <input
            value={valor}
            onChange={e => { setValor(e.target.value); setMostrar(true) }}
            onFocus={() => setMostrar(true)}
            onBlur={() => setTimeout(() => setMostrar(false), 150)}
            placeholder={placeholder}
            autoComplete="off"
          />
          {mostrarSug && filtradas.length > 0 && (
            <div className="autocomplete-list">
              {filtradas.map((s, i) => (
                <div key={i} className="autocomplete-item" onMouseDown={() => { setValor(s); setMostrar(false) }}>
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <button className="btn-crear-turno" style={{background: btnColor || '#19468c', marginTop:14}}
        onClick={guardarYConfirmar}>
        {btnLabel}
      </button>
    </div>
  )
}

// ── FORM ATENDER CON MOTIVO DE CONSULTA ──────────────────────────────────────
function FormAtender({ turno, onAtender }) {
  return (
    <div>
      <h2 className="form-titulo">Marcar como atendido</h2>
      <p className="form-sub">Turno de <strong>{turno.nombre} {turno.apellido}</strong> — {turno.fecha}</p>
      <CampoAutocompletado
        tipo="consulta"
        label="Motivo de consulta / Diagnostico"
        placeholder="Ej: Control anual, Gripe, Fiebre..."
        onConfirmar={onAtender}
        btnLabel="Confirmar atencion"
        btnColor="#228b50"
      />
    </div>
  )
}

// ── POPUP TURNO EN CALENDARIO ─────────────────────────────────────────────────
function PopupTurnoCalendario({ turno, onConfirmar, onAtender, onCancelar }) {
  const colEstado = { PENDIENTE:'#c8821e', CONFIRMADO:'#228b50', ATENDIDO:'#1e64b9', CANCELADO:'#be2d2d' }
  return (
    <div>
      <h2 className="form-titulo">Turno — {turno.fecha}</h2>
      <div className="popup-turno-info">
        <div className="popup-row"><span>Paciente</span><strong>{turno.nombre} {turno.apellido}</strong></div>
        <div className="popup-row"><span>DNI</span><span>{turno.dni || '-'}</span></div>
        <div className="popup-row"><span>Especialidad</span><span>{turno.especialidad}</span></div>
        <div className="popup-row"><span>Medico</span><span>{turno.medico}</span></div>
        <div className="popup-row"><span>Estado</span>
          <span className={`badge badge-${turno.estado?.toLowerCase()}`} style={{color: colEstado[turno.estado]}}>{turno.estado}</span>
        </div>
        {turno.motivo_consulta && <div className="popup-row"><span>Consulta</span><span>{turno.motivo_consulta}</span></div>}
        {turno.motivo_cancelacion && <div className="popup-row"><span>Cancelacion</span><span>{turno.motivo_cancelacion}</span></div>}
      </div>
      {turno.estado !== 'CANCELADO' && turno.estado !== 'ATENDIDO' && (
        <div className="popup-acciones">
          {turno.estado === 'PENDIENTE' && (
            <button className="btn-popup verde" onClick={onConfirmar}>✓ Confirmar</button>
          )}
          <button className="btn-popup azul" onClick={onAtender}>✓ Atendido</button>
          <button className="btn-popup rojo" onClick={onCancelar}>✕ Cancelar</button>
        </div>
      )}
    </div>
  )
}

// ── EXPORTAR CSV MODAL ────────────────────────────────────────────────────────
function ExportarExcelModal({ turnos }) {
  const [opc, setOpc] = useState({
    paciente:true, edad:true, fechaNacimiento:false, dni:true,
    obraSocial:true, especialidad:true, medico:true, estado:true,
    fecha:true, motivoConsulta:true, motivoCancelacion:true, creadoPor:false, id:false
  })
  const [filtroEsp,    setFiltroEsp]    = useState('Todas')
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const [filtroMedico, setFiltroMedico] = useState('Todos')
  const [fechaDesde,   setFechaDesde]   = useState('')
  const [fechaHasta,   setFechaHasta]   = useState('')

  const toggle = key => setOpc(o => ({...o, [key]: !o[key]}))

  const medicos = [...new Set(turnos.map(t => t.medico).filter(Boolean))]
  const especialidades = [...new Set(turnos.map(t => t.especialidad).filter(Boolean))]

  const aplicarFiltros = () => {
    return turnos.filter(t => {
      const mEsp    = filtroEsp    === 'Todas'  || t.especialidad === filtroEsp
      const mEstado = filtroEstado === 'Todos'  || t.estado === filtroEstado
      const mMedico = filtroMedico === 'Todos'  || t.medico === filtroMedico
      const mDesde  = !fechaDesde  || (t.fecha || '') >= fechaDesde
      const mHasta  = !fechaHasta  || (t.fecha || '') <= fechaHasta
      return mEsp && mEstado && mMedico && mDesde && mHasta
    })
  }

  const exportar = () => {
    const filtrados = aplicarFiltros()
    if (filtrados.length === 0) { alert('No hay turnos con esos filtros'); return }
    generarExcel(filtrados, opc)
  }

  const camposCols = [
    ['paciente','Nombre paciente'], ['edad','Edad calculada'], ['fechaNacimiento','Fecha nacimiento'],
    ['dni','DNI'], ['obraSocial','Obra social'], ['especialidad','Especialidad'],
    ['medico','Medico'], ['estado','Estado'], ['fecha','Fecha turno'],
    ['motivoConsulta','Motivo consulta'], ['motivoCancelacion','Motivo cancelacion'],
    ['creadoPor','Creado por'], ['id','ID interno']
  ]

  return (
    <div>
      <h2 className="form-titulo">Exportar datos a Excel</h2>
      <p className="form-sub">Selecciona las columnas y filtros que necesitas</p>

      <div className="export-section">
        <h4 className="export-sec-tit">Columnas a incluir</h4>
        <div className="export-cols">
          {camposCols.map(([key, lbl]) => (
            <label key={key} className={`export-check ${opc[key] ? 'activo' : ''}`}>
              <input type="checkbox" checked={opc[key]} onChange={() => toggle(key)} />
              {lbl}
            </label>
          ))}
        </div>
      </div>

      <div className="export-section">
        <h4 className="export-sec-tit">Filtros</h4>
        <div className="export-filtros">
          <div className="form-field">
            <label>Especialidad</label>
            <select value={filtroEsp} onChange={e => setFiltroEsp(e.target.value)}>
              <option value="Todas">Todas</option>
              {especialidades.map(e => <option key={e}>{e}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Estado</label>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
              {['Todos','PENDIENTE','CONFIRMADO','ATENDIDO','CANCELADO'].map(e => <option key={e}>{e}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Medico</label>
            <select value={filtroMedico} onChange={e => setFiltroMedico(e.target.value)}>
              <option value="Todos">Todos</option>
              {medicos.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Desde (dd/mm/aaaa)</label>
            <input value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} placeholder="01/06/2026" />
          </div>
          <div className="form-field">
            <label>Hasta (dd/mm/aaaa)</label>
            <input value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} placeholder="30/06/2026" />
          </div>
        </div>
      </div>

      <div className="export-preview">
        <span>📊 {aplicarFiltros().length} turnos listos para exportar</span>
      </div>

      <button className="btn-crear-turno" style={{marginTop:16}} onClick={exportar}>
        Descargar Excel (.xlsx)
      </button>
    </div>
  )
}
