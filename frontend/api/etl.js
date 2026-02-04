import * as XLSX from 'xlsx';

export const analizarArchivos = (buffer) => {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (data.length === 0) return { columns: [], preview: [] };
    
    const headers = data[0];
    const preview = data.slice(1, 6).map(row => {
        let obj = {};
        headers.forEach((h, i) => obj[h] = row[i]);
        return obj;
    });
    
    return { columns: headers, preview };
};

export const procesarCitas = (buffer, mapping, agendaId) => {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet);
    
    return rawData.map(row => {
        let cita = { agenda_id: agendaId };
        
        // Mapear campos base
        if (mapping.nombres_completos) cita.nombres_completos = row[mapping.nombres_completos];
        if (mapping.documento) cita.documento = row[mapping.documento];
        if (mapping.celular) cita.celular = row[mapping.celular];
        if (mapping.email) cita.email = row[mapping.email];
        if (mapping.fecha) cita.fecha = row[mapping.fecha];
        if (mapping.hora) cita.hora = row[mapping.hora];
        if (mapping.vendedor) cita.vendedor = row[mapping.vendedor];
        
        // Otros campos adicionales
        let otros = {};
        mapping.otros_campos?.forEach(f => otros[f] = row[f]);
        cita.otros = JSON.stringify(otros);
        
        return cita;
    });
};
