package com.digitaldodo.arth.feature.people

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.model.*
import com.digitaldodo.arth.data.repository.PeopleRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class PeopleUiState(
    val people: List<Person> = emptyList(),
    val totalOwedToUserPaise: Long = 0L,
    val totalUserOwesPaise: Long = 0L,
    val selectedPerson: Person? = null,
    val selectedPersonTransactions: List<PersonTransaction> = emptyList(),
    val showAddPersonDialog: Boolean = false,
    val showRecordDebtDialog: Boolean = false
)

class PeopleViewModel(application: Application) : AndroidViewModel(application) {
    private val db = ArthDatabase.getInstance(application)
    private val repo = PeopleRepository(db.personDao(), db.personTransactionDao())

    private val _uiState = MutableStateFlow(PeopleUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadPeople()
    }

    private fun loadPeople() {
        viewModelScope.launch {
            repo.observePeople().collectLatest { list ->
                var owedToUser = 0L
                var userOwes = 0L
                for (p in list) {
                    if (p.totalBalancePaise > 0) {
                        owedToUser += p.totalBalancePaise
                    } else if (p.totalBalancePaise < 0) {
                        userOwes += kotlin.math.abs(p.totalBalancePaise)
                    }
                }
                _uiState.update { current ->
                    current.copy(
                        people = list,
                        totalOwedToUserPaise = owedToUser,
                        totalUserOwesPaise = userOwes,
                        selectedPerson = current.selectedPerson?.let { sel -> list.find { it.id == sel.id } }
                    )
                }
            }
        }
    }

    fun selectPerson(person: Person?) {
        _uiState.update { it.copy(selectedPerson = person) }
        if (person != null) {
            viewModelScope.launch {
                repo.observeTransactionsForPerson(person.id).collectLatest { txs ->
                    _uiState.update { it.copy(selectedPersonTransactions = txs) }
                }
            }
        }
    }

    fun showAddPersonDialog(show: Boolean) {
        _uiState.update { it.copy(showAddPersonDialog = show) }
    }

    fun showRecordDebtDialog(show: Boolean) {
        _uiState.update { it.copy(showRecordDebtDialog = show) }
    }

    fun addPerson(name: String, phone: String?, notes: String?) {
        if (name.isBlank()) return
        viewModelScope.launch {
            repo.addPerson(name.trim(), phone?.trim(), notes?.trim())
            showAddPersonDialog(false)
        }
    }

    fun recordDebtTransaction(
        personId: String,
        amountPaise: Long,
        type: PersonTransactionType,
        paymentMode: PaymentMode,
        notes: String?
    ) {
        if (amountPaise <= 0L) return
        viewModelScope.launch {
            repo.recordPersonTransaction(personId, amountPaise, type, paymentMode, notes)
            showRecordDebtDialog(false)
        }
    }

    fun settlePerson(personId: String, paymentMode: PaymentMode) {
        viewModelScope.launch {
            val person = _uiState.value.people.find { it.id == personId } ?: return@launch
            if (person.totalBalancePaise == 0L) return@launch
            val amountPaise = kotlin.math.abs(person.totalBalancePaise)
            repo.recordPersonTransaction(
                personId = personId,
                amountPaise = amountPaise,
                type = PersonTransactionType.SETTLEMENT,
                paymentMode = paymentMode,
                notes = "Settled debt"
            )
        }
    }
}
