import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import './App.css'

const ESPECIALIDADES = ['Cardiologia', 'Pediatria', 'Dermatologia']
const HORAS = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00',
               '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto',
               'Septiembre','Octubre','Noviembre','Diciembre']
const MEDICO_MAP = { Cardiologia:'Dr. Garcia', Pediatria:'Dra. Lopez', Dermatologia:'Dr. Martinez' }
const USUARIOS_DEFAULT = [
  { nombre:'admin',  apellido:'admin',    contrasena:'1234', rol:'ADMIN',    especialidad:'' },
  { nombre:'Carlos', apellido:'Garcia',   contrasena:'1234', rol:'MEDICO',   especialidad:'Cardiologia' },
  { nombre:'Ana',    apellido:'Lopez',    contrasena:'1234', rol:'MEDICO',   especialidad:'Pediatria' },
  { nombre:'Pedro',  apellido:'Martinez', contrasena:'1234', rol:'MEDICO',   especialidad:'Dermatologia' },
  { nombre:'Juan',   apellido:'Perez',    contrasena:'1234', rol:'PACIENTE', especialidad:'' },
  { nombre:'Maria',  apellido:'Gomez',    contrasena:'1234', rol:'PACIENTE', especialidad:'' },
]

export default function App() {
  const [sesion, setSesion]     = useState(null)
  const [pantalla, setPantalla] = useState('login')
  const [turnos, setTurnos]     = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(false)
  const [notif, setNotif]       = useState(null)
  const [modal, setModal]       = useState(null)
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
    if (data) setTurnos(filtrarTurnos(data, u))
  }, [])

  const cargarUsuarios = useCallback(async () => {
    const { data } = await supabase.from('usuarios').select('*')
    if (!data || data.length === 0) {
      await supabase.from('usuarios').insert(USUARIOS_DEFAULT)
      setUsuarios(USUARIOS_DEFAULT)
    } else setUsuarios(data)
  }, [])

  useEffect(() => { cargarUsuarios() }, [cargarUsuarios])

  // Realtime observer
  useEffect(() => {
    if (!sesion) return
    const channel = supabase.channel('turnos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos' }, () => {
        cargarTurnos(sesion)
        mostrarNotif('Turnos actualizados en tiempo real', 'ok')
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
    const solapado = turnos.find(t =>
      t.especialidad?.toLowerCase() === especialidad.toLowerCase() &&
      t.fecha === fecha && t.estado !== 'CANCELADO'
    )
    if (solapado) { mostrarNotif('Ese horario ya esta ocupado', 'error'); return false }
    const nuevo = {
      nombre, apellido, dni, obra_social: obraSocial,
      especialidad, medico: MEDICO_MAP[especialidad] || 'Sin asignar',
      estado: 'PENDIENTE', fecha,
      creado_por: sesion.nombre + ' ' + sesion.apellido
    }
    const { error } = await supabase.from('turnos').insert([nuevo])
    if (error) { mostrarNotif('Error al crear turno', 'error'); return false }
    await cargarTurnos(sesion)
    mostrarNotif('Turno registrado correctamente')
    return true
  }

  const cambiarEstado = async (turno, nuevoEstado) => {
    await supabase.from('turnos').update({ estado: nuevoEstado }).eq('id', turno.id)
    await cargarTurnos(sesion)
    mostrarNotif('Estado actualizado')
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
      .select('nombre,apellido,obra_social')
      .eq('dni', dni)
      .limit(1)
    return data?.[0] || null
  }

  return (
    <div className="app">
      {notif && <Notificacion notif={notif} />}
      {modal && <Modal modal={modal} setModal={setModal} />}
      {pantalla === 'login' && <Login onLogin={login} cargando={cargando} />}
      {pantalla === 'panel' && sesion && (
        <Panel
          sesion={sesion} turnos={turnos} usuarios={usuarios}
          onCerrarSesion={cerrarSesion} onCrearTurno={crearTurno}
          onCambiarEstado={cambiarEstado} onRegistrarUsuario={registrarUsuario}
          onEliminarUsuario={eliminarUsuario} setModal={setModal}
          mostrarNotif={mostrarNotif} buscarDni={buscarPacientePorDni}
          sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
        />
      )}
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
  const [nombre, setNombre]   = useState('')
  const [apellido, setApellido] = useState('')
  const [pass, setPass]       = useState('')

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

function Panel({ sesion, turnos, usuarios, onCerrarSesion, onCrearTurno, onCambiarEstado,
  onRegistrarUsuario, onEliminarUsuario, setModal, mostrarNotif, buscarDni,
  sidebarOpen, setSidebarOpen }) {

  const [vistaActual, setVistaActual] = useState('dashboard')
  const [turnoSel, setTurnoSel]       = useState(null)
  const esAdmin   = sesion.rol === 'ADMIN'
  const esMedico  = sesion.rol === 'MEDICO'

  const pend = turnos.filter(t => t.estado === 'PENDIENTE').length
  const conf = turnos.filter(t => t.estado === 'CONFIRMADO').length
  const aten = turnos.filter(t => t.estado === 'ATENDIDO').length

  const abrirNuevoTurno = () => {
    setSidebarOpen(false)
    setModal(
      <FormNuevoTurno sesion={sesion} turnos={turnos} buscarDni={buscarDni}
        onCrear={async (datos) => { const ok = await onCrearTurno(datos); if (ok) setModal(null) }} />
    )
  }

  const navegar = (vista) => { setVistaActual(vista); setSidebarOpen(false) }

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
          <SideBtn label="Dashboard" color="dorado" onClick={() => navegar('dashboard')} activo={vistaActual==='dashboard'} />
          <SideBtn label="Nuevo turno" color="dorado" onClick={abrirNuevoTurno} />
          {(esAdmin || esMedico) && <>
            <SideBtn label="Confirmar" color="verde" onClick={() => {
              if (!turnoSel) { mostrarNotif('Selecciona un turno', 'error'); return }
              onCambiarEstado(turnoSel, 'CONFIRMADO'); setTurnoSel(null)
            }} />
            <SideBtn label="Marcar atendido" color="azul" onClick={() => {
              if (!turnoSel) { mostrarNotif('Selecciona un turno', 'error'); return }
              onCambiarEstado(turnoSel, 'ATENDIDO'); setTurnoSel(null)
            }} />
            <SideBtn label="Cancelar" color="rojo" onClick={() => {
              if (!turnoSel) { mostrarNotif('Selecciona un turno', 'error'); return }
              onCambiarEstado(turnoSel, 'CANCELADO'); setTurnoSel(null)
            }} />
            <div className="sidebar-sep" />
            <SideBtn label="Mis turnos" color="gris" onClick={() => navegar('turnos')} activo={vistaActual==='turnos'} />
            <SideBtn label="Gestion" color="azul2" onClick={() => navegar('gestion')} activo={vistaActual==='gestion'} />
            {esMedico && <SideBtn label="Agenda" color="violeta" onClick={() => navegar('agenda')} activo={vistaActual==='agenda'} />}
            <SideBtn label="Estadisticas" color="violeta" onClick={() => navegar('estadisticas')} activo={vistaActual==='estadisticas'} />
          </>}
          {esAdmin && <SideBtn label="Usuarios" color="azul" onClick={() => navegar('usuarios')} activo={vistaActual==='usuarios'} />}
          <div className="sidebar-sep" />
          <SideBtn label="Cerrar sesion" color="rojo" onClick={onCerrarSesion} />
        </aside>

        <main className="panel-main">
          {vistaActual === 'dashboard' && <Dashboard sesion={sesion} turnos={turnos} onNuevoTurno={abrirNuevoTurno} />}
          {vistaActual === 'turnos' && <TablaTurnos turnos={turnos} turnoSel={turnoSel} setTurnoSel={setTurnoSel} titulo="Mis Turnos" onVerHistorial={(t) => setModal(<HistorialPaciente turno={t} turnos={turnos} />)} />}
          {vistaActual === 'gestion' && <GestionTurnos turnos={turnos} onVerHistorial={(t) => setModal(<HistorialPaciente turno={t} turnos={turnos} />)} />}
          {vistaActual === 'agenda' && esMedico && <AgendaMedico turnos={turnos} sesion={sesion} />}
          {vistaActual === 'estadisticas' && <Estadisticas turnos={turnos} />}
          {vistaActual === 'usuarios' && esAdmin && <GestionUsuarios usuarios={usuarios} onRegistrar={onRegistrarUsuario} onEliminar={onEliminarUsuario} />}
        </main>

        <aside className="notif-panel">
          <div className="notif-header">Notificaciones <span className="notif-tag">● Observer</span></div>
          {turnos.slice(-10).reverse().map((t, i) => (
            <div key={i} className={`notif-item ${i === 0 ? 'notif-first' : ''}`}>
              <span className={`badge badge-${t.estado?.toLowerCase()}`}>{t.estado}</span>
              <span className="notif-pac">{t.nombre} {t.apellido}</span>
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

function SideBtn({ label, color, onClick, activo }) {
  return <button className={`side-btn side-${color} ${activo ? 'side-activo' : ''}`} onClick={onClick}>{label}</button>
}

function Dashboard({ sesion, turnos, onNuevoTurno }) {
  const hoy = new Date()
  const hoyStr = `${String(hoy.getDate()).padStart(2,'0')}/${String(hoy.getMonth()+1).padStart(2,'0')}/${hoy.getFullYear()}`
  const turnosHoy = turnos.filter(t => t.fecha?.startsWith(hoyStr))
  const pend = turnos.filter(t => t.estado === 'PENDIENTE')
  const prox = turnos.filter(t => t.estado === 'PENDIENTE' || t.estado === 'CONFIRMADO').slice(0, 5)

  return (
    <div className="dashboard">
      <div className="dash-bienvenida">
        <div>
          <h2 className="dash-titulo">Bienvenido, {sesion.nombre} {sesion.apellido}</h2>
          <p className="dash-sub">{sesion.rol} — {hoy.toLocaleDateString('es-AR', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
        </div>
        <button className="btn-nuevo-dash" onClick={onNuevoTurno}>+ Nuevo Turno</button>
      </div>

      <div className="dash-cards">
        <DashCard titulo="Turnos hoy" valor={turnosHoy.length} color="#1e64b9" icono="📅" />
        <DashCard titulo="Pendientes" valor={pend.length} color="#c8821e" icono="⏳" />
        <DashCard titulo="Total turnos" valor={turnos.length} color="#228b50" icono="📋" />
        <DashCard titulo="Atendidos" valor={turnos.filter(t=>t.estado==='ATENDIDO').length} color="#6030a0" icono="✓" />
      </div>

      {prox.length > 0 && (
        <div className="dash-prox">
          <h3 className="dash-sec-titulo">Proximos turnos</h3>
          <div className="dash-prox-lista">
            {prox.map((t, i) => (
              <div key={i} className="dash-prox-item">
                <div className="dash-prox-fecha">{t.fecha}</div>
                <div className="dash-prox-pac">{t.nombre} {t.apellido}</div>
                <div className="dash-prox-esp">{t.especialidad}</div>
                <span className={`badge badge-${t.estado?.toLowerCase()}`}>{t.estado}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {turnosHoy.length > 0 && (
        <div className="dash-prox">
          <h3 className="dash-sec-titulo">Turnos de hoy</h3>
          <div className="dash-prox-lista">
            {turnosHoy.map((t, i) => (
              <div key={i} className="dash-prox-item">
                <div className="dash-prox-fecha">{t.fecha?.split(' ')[1]}</div>
                <div className="dash-prox-pac">{t.nombre} {t.apellido}</div>
                <div className="dash-prox-esp">{t.medico}</div>
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
    <div className="dash-card" style={{ borderTop: `4px solid ${color}` }}>
      <span className="dash-card-icono">{icono}</span>
      <span className="dash-card-num" style={{ color }}>{valor}</span>
      <span className="dash-card-lbl">{titulo}</span>
    </div>
  )
}

function AgendaMedico({ turnos, sesion }) {
  const diasSemana = []
  const hoy = new Date()
  for (let i = 0; i < 7; i++) {
    const d = new Date(hoy)
    d.setDate(hoy.getDate() + i)
    diasSemana.push(d)
  }

  const turnosPorDia = (fecha) => {
    const str = `${String(fecha.getDate()).padStart(2,'0')}/${String(fecha.getMonth()+1).padStart(2,'0')}/${fecha.getFullYear()}`
    return turnos.filter(t => t.fecha?.startsWith(str)).sort((a, b) => {
      const ha = a.fecha?.split(' ')[1] || ''
      const hb = b.fecha?.split(' ')[1] || ''
      return ha.localeCompare(hb)
    })
  }

  const diasNombre = ['Dom','Lun','Mar','Mie','Jue','Vie','Sab']

  return (
    <div className="tabla-wrap">
      <h2 className="tabla-titulo">Agenda — Proximos 7 dias</h2>
      <div className="agenda-grid">
        {diasSemana.map((dia, i) => {
          const ts = turnosPorDia(dia)
          const esHoy = i === 0
          return (
            <div key={i} className={`agenda-dia ${esHoy ? 'agenda-hoy' : ''}`}>
              <div className="agenda-dia-header">
                <span className="agenda-dia-nombre">{diasNombre[dia.getDay()]}</span>
                <span className="agenda-dia-num">{dia.getDate()}</span>
              </div>
              {ts.length === 0
                ? <div className="agenda-vacio">Libre</div>
                : ts.map((t, j) => (
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
      <p style={{color:'#888', fontSize:13, marginBottom:16}}>DNI: {turno.dni || '-'} | Obra social: {turno.obra_social || '-'}</p>
      <table className="tabla">
        <thead><tr><th>#</th><th>Especialidad</th><th>Medico</th><th>Estado</th><th>Fecha</th></tr></thead>
        <tbody>
          {historial.map((t, i) => (
            <tr key={i} className={`fila-${t.estado?.toLowerCase()}`}>
              <td>{i+1}</td>
              <td>{t.especialidad}</td>
              <td>{t.medico}</td>
              <td><span className={`badge badge-${t.estado?.toLowerCase()}`}>{t.estado}</span></td>
              <td>{t.fecha}</td>
            </tr>
          ))}
          {historial.length === 0 && <tr><td colSpan="5" className="tabla-vacia">Sin historial</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function TablaTurnos({ turnos, turnoSel, setTurnoSel, titulo, onVerHistorial }) {
  return (
    <div className="tabla-wrap fade-in">
      {titulo && <h2 className="tabla-titulo">{titulo}</h2>}
      <div className="tabla-scroll">
        <table className="tabla">
          <thead>
            <tr><th>#</th><th>Paciente</th><th>DNI</th><th>Obra Social</th><th>Especialidad</th><th>Medico</th><th>Estado</th><th>Fecha</th><th>Historial</th></tr>
          </thead>
          <tbody>
            {turnos.map((t, i) => (
              <tr key={t.id} className={`fila-${t.estado?.toLowerCase()} ${turnoSel?.id === t.id ? 'fila-sel' : ''} fade-row`}
                style={{ animationDelay: `${i * 0.04}s` }}
                onClick={() => setTurnoSel && setTurnoSel(turnoSel?.id === t.id ? null : t)}>
                <td>{i+1}</td>
                <td><strong>{t.nombre} {t.apellido}</strong></td>
                <td>{t.dni || '-'}</td>
                <td>{t.obra_social || '-'}</td>
                <td>{t.especialidad}</td>
                <td>{t.medico}</td>
                <td><span className={`badge badge-${t.estado?.toLowerCase()}`}>{t.estado}</span></td>
                <td>{t.fecha}</td>
                <td>
                  {onVerHistorial && (
                    <button className="btn-hist" onClick={e => { e.stopPropagation(); onVerHistorial(t) }}>Ver</button>
                  )}
                </td>
              </tr>
            ))}
            {turnos.length === 0 && <tr><td colSpan="9" className="tabla-vacia">No hay turnos registrados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GestionTurnos({ turnos, onVerHistorial }) {
  const [filtroFecha, setFiltroFecha]   = useState('')
  const [filtroMedico, setFiltroMedico] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('Todos')

  const filtrados = turnos.filter(t => {
    const mF = !filtroFecha  || t.fecha?.includes(filtroFecha)
    const mM = !filtroMedico || t.medico?.toLowerCase().includes(filtroMedico.toLowerCase())
    const mE = filtroEstado === 'Todos' || t.estado === filtroEstado
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
  const pend = turnos.filter(t => t.estado === 'PENDIENTE').length
  const conf = turnos.filter(t => t.estado === 'CONFIRMADO').length
  const canc = turnos.filter(t => t.estado === 'CANCELADO').length
  const aten = turnos.filter(t => t.estado === 'ATENDIDO').length
  const medicoMap = {}
  turnos.forEach(t => { medicoMap[t.medico] = (medicoMap[t.medico] || 0) + 1 })
  const medicos = Object.entries(medicoMap).sort((a,b) => b[1]-a[1])
  const maxMed = medicos[0]?.[1] || 1

  return (
    <div className="stats-wrap fade-in">
      <h2 className="tabla-titulo">Estadisticas</h2>
      <div className="stats-cards">
        <StatCard label="TOTAL"      valor={turnos.length} color="#1e64b9" />
        <StatCard label="PENDIENTE"  valor={pend}          color="#c8821e" />
        <StatCard label="CONFIRMADO" valor={conf}          color="#228b50" />
        <StatCard label="CANCELADO"  valor={canc}          color="#be2d2d" />
        <StatCard label="ATENDIDO"   valor={aten}          color="#6030a0" />
      </div>
      <div className="stats-medicos">
        <h3>Turnos por medico</h3>
        {medicos.map(([med, cnt], i) => (
          <div key={med} className="barra-row">
            <span className="barra-nombre">{med}</span>
            <div className="barra-cont">
              <div className="barra-fill" style={{ width:`${(cnt/maxMed)*100}%`, background: i===0 ? '#be9b5a' : '#1e64b9' }} />
            </div>
            <span className="barra-val">{cnt}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, valor, color }) {
  return (
    <div className="stat-card">
      <span className="stat-num" style={{ color }}>{valor}</span>
      <span className="stat-lbl">{label}</span>
    </div>
  )
}

function GestionUsuarios({ usuarios, onRegistrar, onEliminar }) {
  const [form, setForm] = useState({ nombre:'', apellido:'', contrasena:'', rol:'MEDICO', especialidad:'Cardiologia' })
  const submit = async e => {
    e.preventDefault()
    const ok = await onRegistrar(form)
    if (ok) setForm({ nombre:'', apellido:'', contrasena:'', rol:'MEDICO', especialidad:'Cardiologia' })
  }
  return (
    <div className="tabla-wrap fade-in">
      <h2 className="tabla-titulo">Gestion de Usuarios</h2>
      <form className="form-usuario" onSubmit={submit}>
        <input placeholder="Nombre" value={form.nombre} onChange={e => setForm({...form, nombre:e.target.value})} required />
        <input placeholder="Apellido" value={form.apellido} onChange={e => setForm({...form, apellido:e.target.value})} required />
        <input placeholder="Contrasena" value={form.contrasena} onChange={e => setForm({...form, contrasena:e.target.value})} required />
        <select value={form.rol} onChange={e => setForm({...form, rol:e.target.value})}>
          <option>MEDICO</option><option>PACIENTE</option><option>ADMIN</option>
        </select>
        {form.rol === 'MEDICO' && (
          <select value={form.especialidad} onChange={e => setForm({...form, especialidad:e.target.value})}>
            {ESPECIALIDADES.map(e => <option key={e}>{e}</option>)}
          </select>
        )}
        <button type="submit" className="btn-registrar">Registrar</button>
      </form>
      <table className="tabla">
        <thead><tr><th>Nombre</th><th>Apellido</th><th>Rol</th><th>Especialidad</th><th></th></tr></thead>
        <tbody>
          {usuarios.map((u, i) => (
            <tr key={i} className="fade-row" style={{ animationDelay:`${i*0.03}s` }}>
              <td>{u.nombre}</td><td>{u.apellido}</td>
              <td><span className={`badge badge-rol-${u.rol?.toLowerCase()}`}>{u.rol}</span></td>
              <td>{u.especialidad || '-'}</td>
              <td>{u.nombre !== 'admin' && <button className="btn-eliminar" onClick={() => onEliminar(u.id, u.nombre)}>Eliminar</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FormNuevoTurno({ sesion, turnos, onCrear, buscarDni }) {
  const esPaciente = sesion.rol === 'PACIENTE'
  const esMedico   = sesion.rol === 'MEDICO'
  const hoy = new Date()
  const anio = hoy.getFullYear()
  const dias = Array.from({length:31}, (_,i) => String(i+1).padStart(2,'0'))
  const [form, setForm] = useState({
    nombre: esPaciente ? sesion.nombre : '',
    apellido: esPaciente ? sesion.apellido : '',
    dni:'', obraSocial:'',
    especialidad: esMedico ? sesion.especialidad : 'Cardiologia',
    dia: String(hoy.getDate()).padStart(2,'0'),
    mes: String(hoy.getMonth()+1).padStart(2,'0'),
    hora:'08:00'
  })
  const [buscandoDni, setBuscandoDni] = useState(false)

  const fechaHora = `${form.dia}/${form.mes}/${anio} ${form.hora}`
  const horaOcupada = h => {
    const fh = `${form.dia}/${form.mes}/${anio} ${h}`
    return turnos.some(t => t.especialidad?.toLowerCase() === form.especialidad.toLowerCase() && t.fecha === fh && t.estado !== 'CANCELADO')
  }

  const handleDni = async (val) => {
    const v = val.replace(/\D/g,'').slice(0,8)
    setForm(f => ({...f, dni:v}))
    if (v.length >= 7) {
      setBuscandoDni(true)
      const encontrado = await buscarDni(v)
      if (encontrado) {
        setForm(f => ({ ...f, dni:v, nombre: encontrado.nombre, apellido: encontrado.apellido, obraSocial: encontrado.obra_social || '' }))
      }
      setBuscandoDni(false)
    }
  }

  const submit = async e => {
    e.preventDefault()
    if (form.dni && (form.dni.length < 7 || form.dni.length > 8)) { alert('DNI debe tener 7 u 8 numeros'); return }
    if (horaOcupada(form.hora)) { alert('Ese horario ya esta ocupado'); return }
    await onCrear({ ...form, fecha: fechaHora, obraSocial: form.obraSocial })
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
          <input value={form.obraSocial} onChange={e => setForm({...form, obraSocial:e.target.value})} />
        </div>
        <div className="form-field">
          <label>Nombre</label>
          <input value={form.nombre} onChange={e => setForm({...form, nombre:e.target.value})} readOnly={esPaciente} required />
        </div>
        <div className="form-field">
          <label>Apellido</label>
          <input value={form.apellido} onChange={e => setForm({...form, apellido:e.target.value})} readOnly={esPaciente} required />
        </div>
        <div className="form-field">
          <label>Especialidad</label>
          <select value={form.especialidad} onChange={e => setForm({...form, especialidad:e.target.value})} disabled={esMedico}>
            {ESPECIALIDADES.map(e => <option key={e}>{e}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Hora</label>
          <select value={form.hora} onChange={e => setForm({...form, hora:e.target.value})}>
            {HORAS.map(h => <option key={h} value={h} disabled={horaOcupada(h)}>{h}{horaOcupada(h) ? ' [OCUPADO]' : ''}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Dia</label>
          <select value={form.dia} onChange={e => setForm({...form, dia:e.target.value})}>
            {dias.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Mes / Año</label>
          <div style={{display:'flex', gap:8}}>
            <select value={form.mes} onChange={e => setForm({...form, mes:e.target.value})} style={{flex:1}}>
              {MESES.map((m,i) => <option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
            </select>
            <input value={anio} readOnly style={{width:70, background:'#f0f4fb', color:'#888'}} />
          </div>
        </div>
      </div>
      <button type="submit" className="btn-crear-turno">Registrar Turno</button>
    </form>
  )
}
