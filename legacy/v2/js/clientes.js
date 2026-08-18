/**
 * Clientes Module - Cadastro e Gerenciamento de Clientes
 */

const Clientes = {
    currentType: 'fisica',

    /**
     * Inicializa o módulo de clientes
     */
    init() {
        this.bindEvents();
    },

    /**
     * Vincula eventos
     */
    bindEvents() {
        // Botão nova pessoa
        document.getElementById('btnNewClient')?.addEventListener('click', () => this.openModal());

        // Fechar modal
        document.getElementById('closeClientModal')?.addEventListener('click', () => this.closeModal());
        document.getElementById('cancelClientBtn')?.addEventListener('click', () => this.closeModal());

        // Salvar cliente
        document.getElementById('saveClientBtn')?.addEventListener('click', () => this.save());

        // Abas Física/Jurídica
        document.querySelectorAll('.client-type-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchType(e.target.dataset.type));
        });

        // Toggle endereço
        document.getElementById('toggleEndereco')?.addEventListener('change', (e) => {
            document.getElementById('camposEndereco').classList.toggle('hidden', !e.target.checked);
        });

        // Buscar cliente
        document.getElementById('clientSearch')?.addEventListener('input', (e) => this.search(e.target.value));

        // Máscara de CPF
        document.getElementById('clientCpf')?.addEventListener('input', (e) => {
            e.target.value = this.maskCPF(e.target.value);
        });

        // Máscara de CNPJ
        document.getElementById('clientCnpj')?.addEventListener('input', (e) => {
            e.target.value = this.maskCNPJ(e.target.value);
        });

        // Máscara de telefone
        document.getElementById('clientTelefone')?.addEventListener('input', (e) => {
            e.target.value = this.maskPhone(e.target.value);
        });

        // Máscara de CEP
        document.getElementById('clientCep')?.addEventListener('input', (e) => {
            e.target.value = this.maskCEP(e.target.value);
        });

        // Busca CEP
        document.getElementById('clientCep')?.addEventListener('blur', (e) => {
            const cep = e.target.value.replace(/\D/g, '');
            if (cep.length === 8) this.searchCEP(cep);
        });

        // Fechar modal clicando fora
        document.getElementById('clientModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'clientModal') this.closeModal();
        });
    },

    /**
     * Alterna entre tipo Física/Jurídica
     */
    switchType(type) {
        this.currentType = type;

        // Atualiza abas
        document.querySelectorAll('.client-type-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.type === type);
        });

        // Mostra/esconde campos
        document.getElementById('camposFisica').classList.toggle('hidden', type === 'juridica');
        document.getElementById('camposJuridica').classList.toggle('hidden', type === 'fisica');
    },

    /**
     * Abre modal de cliente
     */
    openModal(clientId = null) {
        const modal = document.getElementById('clientModal');
        const form = document.getElementById('clientForm');
        const title = document.getElementById('clientModalTitle');

        form.reset();
        this.switchType('fisica');
        document.getElementById('camposEndereco').classList.add('hidden');
        document.getElementById('toggleEndereco').checked = false;

        if (clientId) {
            const client = this.getById(clientId);
            if (client) {
                title.textContent = 'Editar pessoa';
                document.getElementById('clientId').value = client.id;
                this.fillForm(client);
            }
        } else {
            title.textContent = 'Nova pessoa';
            document.getElementById('clientId').value = '';
        }

        modal.classList.remove('hidden');
    },

    /**
     * Fecha modal
     */
    closeModal() {
        document.getElementById('clientModal').classList.add('hidden');
    },

    /**
     * Preenche formulário com dados do cliente
     */
    fillForm(client) {
        this.switchType(client.tipo);

        if (client.tipo === 'fisica') {
            document.getElementById('clientNome').value = client.nome || '';
            document.getElementById('clientCpf').value = client.cpf || '';
            document.getElementById('clientRg').value = client.rg || '';
        } else {
            document.getElementById('clientRazaoSocial').value = client.razaoSocial || '';
            document.getElementById('clientNomeFantasia').value = client.nomeFantasia || '';
            document.getElementById('clientCnpj').value = client.cnpj || '';
            document.getElementById('clientIe').value = client.ie || '';
        }

        document.getElementById('clientTelefone').value = client.telefone || '';
        document.getElementById('clientEmail').value = client.email || '';
        document.getElementById('clientObs').value = client.observacoes || '';

        // Endereço
        if (client.endereco) {
            document.getElementById('toggleEndereco').checked = true;
            document.getElementById('camposEndereco').classList.remove('hidden');
            document.getElementById('clientCep').value = client.endereco.cep || '';
            document.getElementById('clientLogradouro').value = client.endereco.logradouro || '';
            document.getElementById('clientNumero').value = client.endereco.numero || '';
            document.getElementById('clientComplemento').value = client.endereco.complemento || '';
            document.getElementById('clientBairro').value = client.endereco.bairro || '';
            document.getElementById('clientCidade').value = client.endereco.cidade || '';
            document.getElementById('clientEstado').value = client.endereco.estado || '';
        }
    },

    /**
     * Salva cliente
     */
    save() {
        const id = document.getElementById('clientId').value;
        const tipo = this.currentType;

        let nome, documento;
        if (tipo === 'fisica') {
            nome = document.getElementById('clientNome').value.trim();
            documento = document.getElementById('clientCpf').value;
            if (!nome) {
                Toast.show('Nome é obrigatório', 'error');
                return;
            }
        } else {
            nome = document.getElementById('clientRazaoSocial').value.trim();
            documento = document.getElementById('clientCnpj').value;
            if (!nome) {
                Toast.show('Razão Social é obrigatória', 'error');
                return;
            }
        }

        const client = {
            id: id || this.generateId(),
            tipo,
            nome: tipo === 'fisica' ? nome : null,
            cpf: tipo === 'fisica' ? document.getElementById('clientCpf').value : null,
            rg: tipo === 'fisica' ? document.getElementById('clientRg').value : null,
            razaoSocial: tipo === 'juridica' ? nome : null,
            nomeFantasia: tipo === 'juridica' ? document.getElementById('clientNomeFantasia').value : null,
            cnpj: tipo === 'juridica' ? document.getElementById('clientCnpj').value : null,
            ie: tipo === 'juridica' ? document.getElementById('clientIe').value : null,
            telefone: document.getElementById('clientTelefone').value,
            email: document.getElementById('clientEmail').value,
            observacoes: document.getElementById('clientObs').value,
            endereco: null,
            createdAt: id ? undefined : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Endereço
        if (document.getElementById('toggleEndereco').checked) {
            client.endereco = {
                cep: document.getElementById('clientCep').value,
                logradouro: document.getElementById('clientLogradouro').value,
                numero: document.getElementById('clientNumero').value,
                complemento: document.getElementById('clientComplemento').value,
                bairro: document.getElementById('clientBairro').value,
                cidade: document.getElementById('clientCidade').value,
                estado: document.getElementById('clientEstado').value
            };
        }

        // Salvar
        const clients = this.getAll();
        const index = clients.findIndex(c => c.id === client.id);

        if (index >= 0) {
            client.createdAt = clients[index].createdAt;
            clients[index] = client;
        } else {
            clients.push(client);
        }

        localStorage.setItem('kanban_clients', JSON.stringify(clients));

        Toast.show(id ? 'Cliente atualizado!' : 'Cliente cadastrado!', 'success');
        this.closeModal();
        this.render();
    },

    /**
     * Obtém todos os clientes
     */
    getAll() {
        const data = localStorage.getItem('kanban_clients');
        return data ? JSON.parse(data) : [];
    },

    /**
     * Obtém cliente por ID
     */
    getById(id) {
        return this.getAll().find(c => c.id === id);
    },

    /**
     * Exclui cliente
     */
    delete(id) {
        if (!confirm('Deseja realmente excluir este cliente?')) return;

        const clients = this.getAll().filter(c => c.id !== id);
        localStorage.setItem('kanban_clients', JSON.stringify(clients));

        Toast.show('Cliente excluído', 'success');
        this.render();
    },

    /**
     * Renderiza lista de clientes
     */
    render() {
        const tbody = document.getElementById('clientesTableBody');
        const statsDiv = document.getElementById('clientesStats');
        if (!tbody) return;

        const clients = this.getAll();

        // Estatísticas
        const pf = clients.filter(c => c.tipo === 'fisica').length;
        const pj = clients.filter(c => c.tipo === 'juridica').length;

        statsDiv.innerHTML = `
            <div class="stat-chip">
                <span class="stat-icon">👥</span>
                <span>${clients.length} clientes</span>
            </div>
            <div class="stat-chip">
                <span class="stat-icon">👤</span>
                <span>${pf} pessoa física</span>
            </div>
            <div class="stat-chip">
                <span class="stat-icon">🏢</span>
                <span>${pj} pessoa jurídica</span>
            </div>
        `;

        if (clients.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-table">
                        <div class="empty-message">
                            <span>👥</span>
                            <p>Nenhum cliente cadastrado</p>
                            <button class="btn btn-primary-outline" onclick="Clientes.openModal()">
                                Cadastrar primeiro cliente
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = clients.map(client => {
            const nome = client.tipo === 'fisica' ? client.nome : client.razaoSocial;
            const doc = client.tipo === 'fisica' ? client.cpf : client.cnpj;
            const tipo = client.tipo === 'fisica' ? '👤 Física' : '🏢 Jurídica';
            const cidade = client.endereco ? `${client.endereco.cidade || '-'}/${client.endereco.estado || '-'}` : '-';

            return `
                <tr>
                    <td class="client-name">${nome}</td>
                    <td>${doc || '-'}</td>
                    <td><span class="badge badge-${client.tipo}">${tipo}</span></td>
                    <td>${client.telefone || '-'}</td>
                    <td>${client.email || '-'}</td>
                    <td>${cidade}</td>
                    <td class="actions">
                        <button class="btn btn-icon btn-sm" onclick="Clientes.openModal('${client.id}')" title="Editar">
                            ✏️
                        </button>
                        <button class="btn btn-icon btn-sm" onclick="Clientes.delete('${client.id}')" title="Excluir">
                            🗑️
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    /**
     * Busca clientes
     */
    search(query) {
        const tbody = document.getElementById('clientesTableBody');
        if (!tbody) return;

        const clients = this.getAll();
        const q = query.toLowerCase();

        const filtered = clients.filter(c => {
            const nome = (c.tipo === 'fisica' ? c.nome : c.razaoSocial) || '';
            const doc = (c.tipo === 'fisica' ? c.cpf : c.cnpj) || '';
            return nome.toLowerCase().includes(q) ||
                doc.includes(q) ||
                (c.email || '').toLowerCase().includes(q);
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-table">
                        <p class="empty-message">Nenhum cliente encontrado para "${query}"</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(client => {
            const nome = client.tipo === 'fisica' ? client.nome : client.razaoSocial;
            const doc = client.tipo === 'fisica' ? client.cpf : client.cnpj;
            const tipo = client.tipo === 'fisica' ? '👤 Física' : '🏢 Jurídica';
            const cidade = client.endereco ? `${client.endereco.cidade || '-'}/${client.endereco.estado || '-'}` : '-';

            return `
                <tr>
                    <td class="client-name">${nome}</td>
                    <td>${doc || '-'}</td>
                    <td><span class="badge badge-${client.tipo}">${tipo}</span></td>
                    <td>${client.telefone || '-'}</td>
                    <td>${client.email || '-'}</td>
                    <td>${cidade}</td>
                    <td class="actions">
                        <button class="btn btn-icon btn-sm" onclick="Clientes.openModal('${client.id}')" title="Editar">
                            ✏️
                        </button>
                        <button class="btn btn-icon btn-sm" onclick="Clientes.delete('${client.id}')" title="Excluir">
                            🗑️
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    /**
     * Busca CEP via ViaCEP
     */
    async searchCEP(cep) {
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            const data = await response.json();

            if (!data.erro) {
                document.getElementById('clientLogradouro').value = data.logradouro || '';
                document.getElementById('clientBairro').value = data.bairro || '';
                document.getElementById('clientCidade').value = data.localidade || '';
                document.getElementById('clientEstado').value = data.uf || '';
                Toast.show('Endereço encontrado!', 'success');
            }
        } catch (error) {
            console.log('Erro ao buscar CEP:', error);
        }
    },

    /**
     * Máscaras
     */
    maskCPF(value) {
        return value
            .replace(/\D/g, '')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})/, '$1-$2')
            .replace(/(-\d{2})\d+?$/, '$1');
    },

    maskCNPJ(value) {
        return value
            .replace(/\D/g, '')
            .replace(/(\d{2})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1/$2')
            .replace(/(\d{4})(\d)/, '$1-$2')
            .replace(/(-\d{2})\d+?$/, '$1');
    },

    maskPhone(value) {
        return value
            .replace(/\D/g, '')
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{5})(\d)/, '$1-$2')
            .replace(/(-\d{4})\d+?$/, '$1');
    },

    maskCEP(value) {
        return value
            .replace(/\D/g, '')
            .replace(/(\d{5})(\d)/, '$1-$2')
            .replace(/(-\d{3})\d+?$/, '$1');
    },

    /**
     * Gera ID único
     */
    generateId() {
        return 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
};
