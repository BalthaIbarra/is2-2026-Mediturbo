import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import './App.css'

const ESPECIALIDADES = ['Cardiologia', 'Pediatria', 'Dermatologia']
const HORAS = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00',
               '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const USUARIOS_DEFAULT = [
  { nombre:'admin', apellido:'admin', contrasena:'1234', rol:'ADMIN', especialidad:'' },
  { nombre:'Carlos', apellido:'Garcia', contrasena:'1234', rol:'MEDICO', especialidad:'Cardiologia' },
  { nombre:'Ana', apellido:'Lopez', contrasena:'1234', rol:'MEDICO', especialidad:'Pediatria' },
  { nombre:'Pedro', apellido:'Martinez', contrasena:'1234', rol:'MEDICO', especialidad:'Dermatologia' },
  { nombre:'Juan', apellido:'Perez', contrasena:'1234', rol:'PACIENTE', especialidad:'' },
  { nombre:'Maria', apellido:'Gomez', contrasena:'1234', rol:'PACIENTE', especialidad:'' },
]

export default function App() {
  const [sesion, setSesion] = useState(null)
  const [pantalla, setPantalla] = useState('login')
  const [turnos, setTurnos] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(false)
  const [notif, setNotif] = useState(null)
  const [modal, setModal] = useState(null)

  const mostrarNotif = (msg, tipo = 'ok') => {
    setNotif({ msg, tipo })
    setTimeout(() => setNotif(null), 3000)
  }

  const cargarUsuarios = useCallback(async () => {
    const { data } = await supabase.from('usuarios').select('*')
    if (!data || data.length === 0) {
      await supabase.from('usuarios').insert(USUARIOS_DEFAULT)
      setUsuarios(USUARIOS_DEFAULT)
    } else {
      setUsuarios(data)
    }
  }, [])

  const cargarTurnos = useCallback(async (usuarioActual) => {
    const { data } = await supabase.from('turnos').select('*').order('id', { ascending: true })
    if (!data) return
    if (usuarioActual.rol === 'ADMIN') {
      setTurnos(data)
    } else if (usuarioActual.rol === 'MEDICO') {
      setTurnos(data.filter(t =>
        t.medico?.toLowerCase().includes(usuarioActual.apellido.toLowerCase()) &&
        t.especialidad?.toLowerCase() === usuarioActual.especialidad?.toLowerCase()
      ))
    } else {
      setTurnos(data.filter(t =>
        t.nombre?.toLowerCase() === usuarioActual.nombre.toLowerCase() &&
        t.apellido?.toLowerCase() === usuarioActual.apellido.toLowerCase()
      ))
    }
  }, [])

  useEffect(() => { cargarUsuarios() }, [cargarUsuarios])

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
    if (solapado) { mostrarNotif('Ese horario ya esta ocupado para esa especialidad', 'error'); return false }
    const medicoAsignado = (() => {
      const maps = { 'Cardiologia':'Dr. Garcia','Pediatria':'Dra. Lopez','Dermatologia':'Dr. Martinez' }
      return maps[especialidad] || 'Sin asignar'
    })()
    const nuevo = {
      nombre, apellido, dni, obra_social: obraSocial,
      especialidad, medico: medicoAsignado, estado: 'PENDIENTE',
      fecha, creado_por: sesion.nombre + ' ' + sesion.apellido
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

  return (
    <div className="app">
      {notif && <Notificacion notif={notif} />}
      {modal && <Modal modal={modal} setModal={setModal} />}
      {pantalla === 'login' && <Login onLogin={login} cargando={cargando} />}
      {pantalla === 'panel' && sesion && (
        <Panel
          sesion={sesion}
          turnos={turnos}
          usuarios={usuarios}
          onCerrarSesion={cerrarSesion}
          onCrearTurno={crearTurno}
          onCambiarEstado={cambiarEstado}
          onRegistrarUsuario={registrarUsuario}
          onEliminarUsuario={eliminarUsuario}
          setModal={setModal}
          mostrarNotif={mostrarNotif}
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
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [pass, setPass] = useState('')

  const submit = e => {
    e.preventDefault()
    onLogin(nombre, apellido, pass)
  }

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
        <form onSubmit={submit} className="login-form">
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
        <p className="login-hint">admin / admin / 1234 | nombre / apellido / 1234</p>
      </div>
    </div>
  )
}

function Panel({ sesion, turnos, usuarios, onCerrarSesion, onCrearTurno, onCambiarEstado, onRegistrarUsuario, onEliminarUsuario, setModal, mostrarNotif }) {
  const [vistaActual, setVistaActual] = useState('turnos')
  const [turnoSel, setTurnoSel] = useState(null)

  const esAdmin = sesion.rol === 'ADMIN'
  const esMedico = sesion.rol === 'MEDICO'
  const esPaciente = sesion.rol === 'PACIENTE'

  const pend = turnos.filter(t => t.estado === 'PENDIENTE').length
  const conf = turnos.filter(t => t.estado === 'CONFIRMADO').length
  const aten = turnos.filter(t => t.estado === 'ATENDIDO').length

  const abrirNuevoTurno = () => setModal(
    <FormNuevoTurno
      sesion={sesion}
      turnos={turnos}
      onCrear={async (datos) => {
        const ok = await onCrearTurno(datos)
        if (ok) setModal(null)
      }}
    />
  )

  return (
    <div className="panel-wrap">
      <header className="panel-header">
        <div className="header-marca">
          <div className="header-icono">+</div>
          <div>
            <div className="header-nombre">MediTurnos — Centro Medico Cuenca Del Plata</div>
            <div className="header-usuario">usuario: {sesion.nombre} {sesion.apellido} [{sesion.rol}]</div>
          </div>
        </div>
        <div className="header-contadores">
          <div className="contador"><span className="cnt-num amarillo">{pend}</span><span className="cnt-lbl">PENDIENTES</span></div>
          <div className="contador"><span className="cnt-num verde">{conf}</span><span className="cnt-lbl">CONFIRMADOS</span></div>
          <div className="contador"><span className="cnt-num azul">{aten}</span><span className="cnt-lbl">ATENDIDOS</span></div>
        </div>
      </header>

      <div className="panel-body">
        <aside className="sidebar">
          <div className="sidebar-label">Menu</div>
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
            <SideBtn label="Historial" color="gris" onClick={() => setVistaActual('historial')} />
            <SideBtn label="Ver todos los turnos" color="azul2" onClick={() => setVistaActual('gestion')} />
            <SideBtn label="Estadisticas" color="violeta" onClick={() => setVistaActual('estadisticas')} />
          </>}
          {esAdmin && <SideBtn label="Usuarios" color="azul" onClick={() => setVistaActual('usuarios')} />}
          <SideBtn label="Cerrar sesion" color="rojo" onClick={onCerrarSesion} />
        </aside>

        <main className="panel-main">
          {vistaActual === 'turnos' && (
            <TablaTurnos turnos={turnos} turnoSel={turnoSel} setTurnoSel={setTurnoSel} />
          )}
          {vistaActual === 'historial' && <TablaTurnos turnos={turnos} turnoSel={turnoSel} setTurnoSel={setTurnoSel} titulo="Historial" />}
          {vistaActual === 'gestion' && <GestionTurnos turnos={turnos} />}
          {vistaActual === 'estadisticas' && <Estadisticas turnos={turnos} />}
          {vistaActual === 'usuarios' && esAdmin && (
            <GestionUsuarios
              usuarios={usuarios}
              onRegistrar={onRegistrarUsuario}
              onEliminar={onEliminarUsuario}
            />
          )}
        </main>

        <aside className="notif-panel">
          <div className="notif-header">Notificaciones <span className="notif-tag">Observer</span></div>
          {turnos.slice(-8).reverse().map((t, i) => (
            <div key={i} className={`notif-item ${i === 0 ? 'notif-first' : ''}`}>
              Turno de {t.nombre} {t.apellido} — {t.estado}
            </div>
          ))}
        </aside>
      </div>

      <footer className="panel-footer">
        <span>Sistema listo — MediTurnos v1.0</span>
        <span className="footer-pat">Patrones: Strategy + Observer</span>
      </footer>
    </div>
  )
}

function SideBtn({ label, color, onClick }) {
  return <button className={`side-btn side-${color}`} onClick={onClick}>{label}</button>
}

function TablaTurnos({ turnos, turnoSel, setTurnoSel, titulo }) {
  return (
    <div className="tabla-wrap">
      {titulo && <h2 className="tabla-titulo">{titulo}</h2>}
      <div className="tabla-scroll">
        <table className="tabla">
          <thead>
            <tr>
              <th>#</th><th>Paciente</th><th>DNI</th><th>Obra Social</th>
              <th>Especialidad</th><th>Medico</th><th>Estado</th><th>Fecha</th><th>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {turnos.map((t, i) => (
              <tr
                key={t.id}
                className={`fila-${t.estado?.toLowerCase()} ${turnoSel?.id === t.id ? 'fila-sel' : ''}`}
                onClick={() => setTurnoSel && setTurnoSel(turnoSel?.id === t.id ? null : t)}
              >
                <td>{i + 1}</td>
                <td>{t.nombre} {t.apellido}</td>
                <td>{t.dni || '-'}</td>
                <td>{t.obra_social || '-'}</td>
                <td>{t.especialidad}</td>
                <td>{t.medico}</td>
                <td><span className={`badge badge-${t.estado?.toLowerCase()}`}>{t.estado}</span></td>
                <td>{t.fecha}</td>
                <td>{t.creado_por}</td>
              </tr>
            ))}
            {turnos.length === 0 && (
              <tr><td colSpan="9" className="tabla-vacia">No hay turnos registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GestionTurnos({ turnos }) {
  const [filtroFecha, setFiltroFecha] = useState('')
  const [filtroMedico, setFiltroMedico] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('Todos')

  const filtrados = turnos.filter(t => {
    const mFecha  = !filtroFecha  || t.fecha?.includes(filtroFecha)
    const mMedico = !filtroMedico || t.medico?.toLowerCase().includes(filtroMedico.toLowerCase())
    const mEstado = filtroEstado === 'Todos' || t.estado === filtroEstado
    return mFecha && mMedico && mEstado
  })

  return (
    <div className="tabla-wrap">
      <h2 className="tabla-titulo">Gestion de Turnos</h2>
      <div className="filtros">
        <input placeholder="Fecha" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} />
        <input placeholder="Medico" value={filtroMedico} onChange={e => setFiltroMedico(e.target.value)} />
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          {['Todos','PENDIENTE','CONFIRMADO','CANCELADO','ATENDIDO'].map(e => <option key={e}>{e}</option>)}
        </select>
        <button className="btn-limpiar" onClick={() => { setFiltroFecha(''); setFiltroMedico(''); setFiltroEstado('Todos') }}>Limpiar</button>
      </div>
      <TablaTurnos turnos={filtrados} />
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
  const medicos = Object.entries(medicoMap).sort((a, b) => b[1] - a[1])
  const maxMed = medicos[0]?.[1] || 1

  return (
    <div className="stats-wrap">
      <h2 className="tabla-titulo">Estadisticas</h2>
      <div className="stats-cards">
        <StatCard label="TOTAL" valor={turnos.length} color="#1e64b9" />
        <StatCard label="PENDIENTE" valor={pend} color="#c8821e" />
        <StatCard label="CONFIRMADO" valor={conf} color="#228b50" />
        <StatCard label="CANCELADO" valor={canc} color="#be2d2d" />
        <StatCard label="ATENDIDO" valor={aten} color="#1e64b9" />
      </div>
      <div className="stats-medicos">
        <h3>Turnos por medico</h3>
        {medicos.map(([med, cnt], i) => (
          <div key={med} className="barra-row">
            <span className="barra-nombre">{med}</span>
            <div className="barra-cont">
              <div className="barra-fill" style={{ width: `${(cnt / maxMed) * 100}%`, background: i === 0 ? '#be9b5a' : '#1e64b9' }} />
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
  const [form, setForm] = useState({ nombre:'', apellido:'', contrasena:'', rol:'MEDICO', especialidad:'' })

  const submit = async e => {
    e.preventDefault()
    await onRegistrar(form)
    setForm({ nombre:'', apellido:'', contrasena:'', rol:'MEDICO', especialidad:'' })
  }

  return (
    <div className="tabla-wrap">
      <h2 className="tabla-titulo">Gestion de Usuarios</h2>
      <form className="form-usuario" onSubmit={submit}>
        <input placeholder="Nombre" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} required />
        <input placeholder="Apellido" value={form.apellido} onChange={e => setForm({...form, apellido: e.target.value})} required />
        <input placeholder="Contrasena" value={form.contrasena} onChange={e => setForm({...form, contrasena: e.target.value})} required />
        <select value={form.rol} onChange={e => setForm({...form, rol: e.target.value})}>
          <option>MEDICO</option><option>PACIENTE</option><option>ADMIN</option>
        </select>
        {form.rol === 'MEDICO' && (
          <select value={form.especialidad} onChange={e => setForm({...form, especialidad: e.target.value})}>
            {ESPECIALIDADES.map(e => <option key={e}>{e}</option>)}
          </select>
        )}
        <button type="submit" className="btn-registrar">Registrar</button>
      </form>
      <table className="tabla">
        <thead><tr><th>Nombre</th><th>Apellido</th><th>Rol</th><th>Especialidad</th><th></th></tr></thead>
        <tbody>
          {usuarios.map((u, i) => (
            <tr key={i}>
              <td>{u.nombre}</td><td>{u.apellido}</td>
              <td><span className={`badge badge-rol-${u.rol?.toLowerCase()}`}>{u.rol}</span></td>
              <td>{u.especialidad || '-'}</td>
              <td>
                {u.nombre !== 'admin' && (
                  <button className="btn-eliminar" onClick={() => onEliminar(u.id, u.nombre)}>Eliminar</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FormNuevoTurno({ sesion, turnos, onCrear }) {
  const esPaciente = sesion.rol === 'PACIENTE'
  const esMedico   = sesion.rol === 'MEDICO'
  const hoy = new Date()
  const anio = hoy.getFullYear()
  const dias = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'))

  const [form, setForm] = useState({
    nombre: esPaciente ? sesion.nombre : '',
    apellido: esPaciente ? sesion.apellido : '',
    dni: '', obraSocial: '',
    especialidad: esMedico ? sesion.especialidad : 'Cardiologia',
    dia: String(hoy.getDate()).padStart(2, '0'),
    mes: String(hoy.getMonth() + 1).padStart(2, '0'),
    hora: '08:00'
  })

  const fechaHora = `${form.dia}/${form.mes}/${anio} ${form.hora}`

  const horaOcupada = (h) => {
    const fh = `${form.dia}/${form.mes}/${anio} ${h}`
    return turnos.some(t =>
      t.especialidad?.toLowerCase() === form.especialidad.toLowerCase() &&
      t.fecha === fh && t.estado !== 'CANCELADO'
    )
  }

  const submit = async e => {
    e.preventDefault()
    if (form.dni && (form.dni.length < 7 || form.dni.length > 8)) {
      alert('El DNI debe tener entre 7 y 8 numeros'); return
    }
    if (horaOcupada(form.hora)) {
      alert('Ese horario ya esta ocupado'); return
    }
    await onCrear({ ...form, fecha: fechaHora, obraSocial: form.obraSocial })
  }

  return (
    <form className="form-turno" onSubmit={submit}>
      <h2 className="form-titulo">Nuevo Turno</h2>
      <div className="form-grid">
        <div className="form-field">
          <label>Nombre</label>
          <input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} readOnly={esPaciente} required />
        </div>
        <div className="form-field">
          <label>Apellido</label>
          <input value={form.apellido} onChange={e => setForm({...form, apellido: e.target.value})} readOnly={esPaciente} required />
        </div>
        <div className="form-field">
          <label>DNI (7-8 digitos)</label>
          <input value={form.dni} onChange={e => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 8)
            setForm({...form, dni: v})
          }} placeholder="Solo numeros" />
        </div>
        <div className="form-field">
          <label>Obra Social</label>
          <input value={form.obraSocial} onChange={e => setForm({...form, obraSocial: e.target.value})} />
        </div>
        <div className="form-field">
          <label>Especialidad</label>
          <select value={form.especialidad} onChange={e => setForm({...form, especialidad: e.target.value})} disabled={esMedico}>
            {ESPECIALIDADES.map(e => <option key={e}>{e}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Dia</label>
          <select value={form.dia} onChange={e => setForm({...form, dia: e.target.value})}>
            {dias.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Mes</label>
          <select value={form.mes} onChange={e => setForm({...form, mes: e.target.value})}>
            {MESES.map((m, i) => (
              <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Hora</label>
          <select value={form.hora} onChange={e => setForm({...form, hora: e.target.value})}>
            {HORAS.map(h => (
              <option key={h} value={h} disabled={horaOcupada(h)}>
                {h}{horaOcupada(h) ? ' [OCUPADO]' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button type="submit" className="btn-crear-turno">Registrar Turno</button>
    </form>
  )
}
